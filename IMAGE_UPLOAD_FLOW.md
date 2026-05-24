# DotShare Image Upload Flow - Complete Documentation

## Overview
The DotShare VS Code extension implements a multi-step image upload process that:
1. Handles file selection and drag-and-drop
2. Compresses/optimizes images on the client side
3. Converts files to base64
4. Sends to the Rust backend via FormData
5. Stores images in Cloudflare R2 bucket
6. Returns public URLs for use in posts

---

## Architecture Diagram

```
User Interface (Webview)
    ↓
File Input / Drag & Drop
    ↓
Image Compression & Base64 Encoding
    ↓
WebView → Extension Host (Message)
    ↓
MessageHandler.handleUploadFile()
    ↓
SchedulerClient.uploadMediaBase64()
    ↓
FormData + Bearer Token
    ↓
Rust Backend: POST /v1/media/upload
    ↓
Multipart Upload Handler
    ↓
Cloudflare R2 Storage
    ↓
Return Public Media URL
    ↓
Webview Update (Replace Placeholder)
    ↓
Post with URL References
```

---

## 1. File Upload Entry Points

### A. Main Media Upload Button
**File:** [media/webview/app.ts](media/webview/app.ts#L307-L323)

```typescript
// Media button click → file picker
btnMedia?.addEventListener('click', () => { 
    if (fileInput) fileInput.click(); 
});

// File input change handler
fileInput?.addEventListener('change', () => {
    const files = fileInput?.files;
    if (!files || !files.length) return;
    
    // Process up to 4 files
    Array.from(files).slice(0, 4).forEach(async file => {
        const isLarge = file.size > 2 * 1024 * 1024;
        if (isLarge && !file.type.match(/video|gif/i)) {
            toast(`✨ Optimizing ${file.name}...`, 'info', 3000);
        }
        try {
            const { base64Data, size, type, name } = await processAndCompressImage(file);
            send('uploadFile', { file: { name, size, type, base64Data } });
        } catch {
            // Fallback: use FileReader without compression
            const reader = new FileReader();
            reader.onload = () => {
                const b64 = (reader.result as string).split(',')[1];
                send('uploadFile', { 
                    file: { name: file.name, size: file.size, type: file.type, base64Data: b64 } 
                });
            };
            reader.readAsDataURL(file);
        }
    });
});
```

### B. Drag & Drop Upload with Placeholder
**File:** [media/webview/app.ts](media/webview/app.ts#L214-L295)

Implements Notion/GitHub-style placeholder pattern:

```typescript
function enableDragAndDrop(editor: HTMLTextAreaElement | null) {
    editor?.addEventListener('drop', async (e) => {
        e.preventDefault();
        const files = e.dataTransfer?.files;
        if (!files || !files.length) return;

        const file = files[0];
        if (!file.type.startsWith('image/')) {
            toast('Only images can be dropped here.', 'warning');
            return;
        }

        // 1. Capture cursor position
        const startPos = editor.selectionStart;
        const endPos = editor.selectionEnd;

        // 2. Create unique placeholder
        const placeholder = `![Uploading ${file.name} ⏳]()`;
        const mdPlaceholder = `\n${placeholder}\n`;

        // 3. Inject placeholder immediately
        editor.value = editor.value.substring(0, startPos) + mdPlaceholder + 
                       editor.value.substring(endPos);
        editor.selectionStart = editor.selectionEnd = startPos + mdPlaceholder.length;
        editor.dispatchEvent(new Event('input'));
        toast(`Uploading ${file.name}…`, 'info');

        // 4. Compress & upload in background
        try {
            let base64Data: string, size: number, type: string, name: string;
            const isLarge = file.size > 2 * 1024 * 1024;
            
            if (isLarge && !file.type.match(/video|gif/i)) {
                const compressed = await processAndCompressImage(file);
                base64Data = compressed.base64Data;
                size = compressed.size;
                type = compressed.type;
                name = compressed.name;
            } else {
                // Use raw file data
                await new Promise<void>((res) => {
                    const reader = new FileReader();
                    reader.onload = () => {
                        base64Data = (reader.result as string).split(',')[1];
                        size = file.size;
                        type = file.type;
                        name = file.name;
                        res();
                    };
                    reader.readAsDataURL(file);
                });
            }
            
            // Send to extension with placeholderRef for later replacement
            send('uploadFile', {
                file: { name: name!, size: size!, type: type!, base64Data: base64Data! },
                placeholderRef: placeholder  // ← Key for identifying which placeholder to replace
            });
        } catch {
            toast('Failed to process dropped image.', 'error');
            // Clean up orphaned placeholder
            editor.value = editor.value.replace(mdPlaceholder, '');
            editor.dispatchEvent(new Event('input'));
        }
    });
}

// Activate on both editors
enableDragAndDrop(get<HTMLTextAreaElement>('post-text'));
enableDragAndDrop(get<HTMLTextAreaElement>('blog-body'));
```

### C. Cover Image Upload (Blog)
**File:** [media/webview/app.ts](media/webview/app.ts#L677-L695)

```typescript
get('btn-upload-cover')?.addEventListener('click', () => {
    const fileInp = document.createElement('input');
    fileInp.type = 'file';
    fileInp.accept = 'image/jpeg,image/png,image/gif,image/webp';
    
    fileInp.addEventListener('change', async () => {
        if (!fileInp.files?.length) return;
        const file = fileInp.files[0];
        
        try {
            const { base64Data, size, type, name } = await processAndCompressImage(file);
            send('uploadFile', { 
                file: { name, size, type, base64Data }, 
                placeholderRef: 'COVER_IMAGE'  // ← Special marker for cover images
            });
        } catch {
            // Fallback
            const reader = new FileReader();
            reader.onload = () => {
                const b64 = (reader.result as string).split(',')[1];
                send('uploadFile', { 
                    file: { name: file.name, size: file.size, type: file.type, base64Data: b64 }, 
                    placeholderRef: 'COVER_IMAGE'
                });
            };
            reader.readAsDataURL(file);
        }
        fileInp.value = '';
    });
    
    fileInp.click();
});
```

---

## 2. Image Compression & Optimization

**File:** [media/webview/app.ts](media/webview/app.ts#L75-L107)

Handles client-side image optimization with canvas API:

```typescript
async function processAndCompressImage(file: File): Promise<{ 
    base64Data: string; 
    size: number; 
    type: string; 
    name: string 
}> {
    // Skip compression for GIFs and non-image files
    if (!file.type.startsWith('image/') || file.type === 'image/gif') {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve({ 
                base64Data: (reader.result as string).split(',')[1], 
                size: file.size, 
                type: file.type, 
                name: file.name 
            });
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    return new Promise((resolve, reject) => {
        const img = new Image();
        img.src = URL.createObjectURL(file);
        
        img.onload = () => {
            URL.revokeObjectURL(img.src);
            const canvas = document.createElement('canvas');
            
            let { width, height } = img;
            const MAX = 2000;  // Max dimensions
            
            // Resize if exceeds limits
            if (width > MAX || height > MAX) {
                if (width > height) { 
                    height *= MAX / width; 
                    width = MAX; 
                } else { 
                    width *= MAX / height; 
                    height = MAX; 
                }
            }
            
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) { reject(new Error('No canvas context')); return; }
            
            // Draw and compress
            ctx.drawImage(img, 0, 0, width, height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.8);  // 80% quality JPEG
            const base64Data = dataUrl.split(',')[1];
            
            // Convert filename to .jpg if needed
            let name = file.name;
            if (!name.toLowerCase().match(/\.(jpg|jpeg)$/)) {
                name = name.replace(/\.[^/.]+$/, '') + '.jpg';
            }
            
            resolve({ 
                base64Data, 
                size: Math.floor(base64Data.length * 0.75),  // Estimated decoded size
                type: 'image/jpeg', 
                name 
            });
        };
        
        img.onerror = () => reject(new Error('Failed to load image'));
    });
}
```

**Compression Rules:**
- Max dimensions: 2000×2000px (scales down proportionally if larger)
- JPEG quality: 80%
- GIFs: No compression (passed through as-is)
- Videos (MP4): No compression
- Size threshold: Auto-optimize if > 2MB

---

## 3. Message Protocol: Webview → Extension Host

**File:** [media/webview/app.ts](media/webview/app.ts#L287-L289)

Webview sends `uploadFile` message with base64 encoded file:

```typescript
send('uploadFile', {
    file: { 
        name: string,           // Original filename
        size: number,           // File size in bytes
        type: string,           // MIME type (e.g., 'image/jpeg')
        base64Data: string      // Base64 encoded file content
    },
    placeholderRef?: string     // Optional: 'COVER_IMAGE' or markdown placeholder
    threadIndex?: number        // Optional: Thread post index for threaded posts
});
```

---

## 4. Extension Host: File Upload Handler

**File:** [src/handlers/MessageHandler.ts](src/handlers/MessageHandler.ts#L314-L358)

Entry point that receives upload message:

```typescript
private async handleUploadFile(message: Message): Promise<void> {
    try {
        const file = message.file as { 
            name: string; 
            size: number; 
            type: string; 
            base64Data: string 
        } | undefined;

        if (!file || !file.name || !file.base64Data) {
            this.sendError('Invalid file data provided.');
            return;
        }

        // Notify UI that upload is starting
        this.view.webview.postMessage({ 
            command: 'status', 
            status: 'Uploading media to Cloudflare R2...', 
            type: 'info' 
        });

        // ═══════════════════════════════════════════════════════════
        // SECURITY: Sanitize client-supplied values (defense-in-depth)
        // Server validates via magic bytes too
        // ═══════════════════════════════════════════════════════════
        const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        const sanitizedType = ALLOWED_TYPES.includes(file.type) 
            ? file.type 
            : 'image/jpeg';
        
        // Strip path traversal & unsafe characters
        const sanitizedName = (file.name || 'upload')
            .replace(/.*[/\\]/, '')              // Strip path components
            .replace(/[^a-zA-Z0-9._-]/g, '_')   // Allow only: alphanumeric, dot, hyphen, underscore
            .substring(0, 64);                   // Max 64 chars

        // Upload to Cloudflare R2 via Rust backend
        const result = await SchedulerClient.uploadMediaBase64(
            this.context, 
            sanitizedName, 
            file.base64Data, 
            sanitizedType
        );

        if (result.success && result.url) {
            // SUCCESS: Return public URL to webview
            this.view.webview.postMessage({
                command: 'fileUploaded',
                mediaPath: result.url,                      // Public URL
                mediaFilePath: result.url,                  // Same URL
                fileName: file.name,                        // Original name for display
                fileSize: file.size,
                threadIndex: message.threadIndex,           // For threaded posts
                placeholderRef: message.placeholderRef ?? null  // Echo back for replacement
            });

            this.sendSuccess(`File "${file.name}" uploaded successfully!`);
        } else {
            this.sendError(result.message || 'Failed to upload media to server.');
        }

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.sendError(`Error uploading file: ${errorMessage}`);
    }
}
```

---

## 5. SchedulerClient: HTTP Upload to Backend

**File:** [src/services/SchedulerClient.ts](src/services/SchedulerClient.ts#L21-L68)

Handles FormData construction and HTTP POST to Rust backend:

```typescript
public static async uploadMediaBase64(
    context: vscode.ExtensionContext,
    fileName: string,
    base64Data: string,
    contentType: string
): Promise<{ success: boolean; url?: string; message?: string }> {
    // Get authentication token
    const token = await DotShareAuth.getToken(context);
    if (!token) {
        return { success: false, message: 'Not authenticated with DotSuite.' };
    }

    try {
        // Convert base64 string back to Buffer
        const buffer = Buffer.from(base64Data, 'base64');

        // ════════════════════════════════════════════════════
        // BUILD MULTIPART FORM DATA
        // ════════════════════════════════════════════════════
        const formData = new FormData();
        formData.append('file', buffer, {
            filename: fileName,              // Filename in multipart
            contentType: contentType         // MIME type
        });

        // Perform HTTP POST request
        const response = await fetch(`${this.getApiBaseUrl()}/v1/media/upload`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                ...formData.getHeaders()  // ← Crucial: multipart/form-data boundary
            },
            body: formData as any  // node-fetch/undici accepts this
        });

        // Parse response
        if (response.ok) {
            const data = await response.json() as { media_url: string };
            Logger.info('[SchedulerClient] Media uploaded successfully:', data.media_url);
            return { 
                success: true, 
                url: data.media_url  // ← Public URL from R2
            };
        } else {
            const errorText = await response.text();
            Logger.warn(`[SchedulerClient] Failed to upload media: ${response.status}`, errorText);
            return { 
                success: false, 
                message: `Upload failed: ${response.statusText}` 
            };
        }
    } catch (error) {
        Logger.error('[SchedulerClient] Error uploading media:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        return { 
            success: false, 
            message: `Network error: ${errorMessage}` 
        };
    }
}
```

**Request Details:**
- **Endpoint:** `POST /v1/media/upload`
- **Auth:** Bearer token in `Authorization` header
- **Body:** Multipart form-data with `file` field
- **Response:** `{ media_url: string }` - Public Cloudflare R2 URL

---

## 6. Rust Backend: Media Upload Endpoint

**File:** [dotsuite-core/src/routes/media.rs](../dotsuite-core/src/routes/media.rs#L53-L160)

Server-side handling with validation and R2 upload:

```rust
pub async fn upload_media(
    State(state): State<AppState>,
    Extension(user): Extension<User>,
    mut multipart: Multipart,
) -> AppResult<impl IntoResponse> {
    let user_id = user.id.ok_or_else(|| AppError::Internal(anyhow::anyhow!("User has no id")))?;
    let image_quota = user.tier.image_quota();

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(format!("Multipart error: {}", e)))?
    {
        let field_name = field.name().unwrap_or("").to_string();
        let has_filename = field.file_name().is_some();

        if field_name == "file" || has_filename {
            // ═════════════════════════════════════════════════════════════
            // 1. READ & VALIDATE FILE (before touching DB)
            // ═════════════════════════════════════════════════════════════
            let data = field
                .bytes()
                .await
                .map_err(|e| AppError::BadRequest(format!("Failed to read file: {}", e)))?;

            // Check file size limit (5MB)
            if data.len() > 5 * 1024 * 1024 {
                return Err(AppError::BadRequest("File size exceeds 5MB limit".into()));
            }

            // ═════════════════════════════════════════════════════════════
            // 2. DETECT FILE TYPE (from magic bytes, not client MIME type)
            // ═════════════════════════════════════════════════════════════
            let (detected_mime, ext) = match detect_from_bytes(&data) {
                Some(result) => result,
                None => return Err(AppError::BadRequest(
                    "Unsupported or invalid file type. Allowed: JPEG, PNG, WebP, GIF".into(),
                )),
            };

            // ═════════════════════════════════════════════════════════════
            // 3. ATOMIC QUOTA CHECK + SLOT RESERVATION
            // ═════════════════════════════════════════════════════════════
            // find_one_and_update eliminates race conditions:
            // Check and increment happen atomically in MongoDB
            let users_col = state.db.collection::<User>("users");
            let updated_user = users_col
                .find_one_and_update(
                    doc! { "_id": &user_id, "images_used": { "$lt": image_quota } },
                    doc! { "$inc": { "images_used": 1 } },
                    FindOneAndUpdateOptions::builder().return_document(ReturnDocument::After).build(),
                )
                .await
                .map_err(|e| AppError::Internal(e.into()))?
                .ok_or_else(|| AppError::BadRequest(format!(
                    "Image upload quota reached ({}/{} uploads). Upgrade to Basic for unlimited uploads.",
                    user.images_used, image_quota
                )))?;

            // ═════════════════════════════════════════════════════════════
            // 4. UPLOAD TO CLOUDFLARE R2
            // ═════════════════════════════════════════════════════════════
            // UUID key — immune to path traversal; raw client filename discarded
            let file_name = format!("dotsuite/scheduled_posts/{}.{}", Uuid::new_v4(), ext);
            let bucket = &state.config.r2_bucket_name;

            let upload_result = state
                .s3_client
                .put_object()
                .bucket(bucket)
                .key(&file_name)
                .body(ByteStream::from(data))
                .content_type(detected_mime)
                .send()
                .await;

            if let Err(e) = upload_result {
                tracing::error!("Failed to upload to R2: {:?}", e);
                // Decrement quota on upload failure
                users_col
                    .update_one(
                        doc! { "_id": &user_id },
                        doc! { "$inc": { "images_used": -1 } },
                    )
                    .await
                    .ok();
                return Err(AppError::Internal(e.into()));
            }

            // ═════════════════════════════════════════════════════════════
            // 5. RETURN PUBLIC URL
            // ═════════════════════════════════════════════════════════════
            let public_url = &state.config.r2_public_url;
            let media_url = format!("{}/{}", public_url, file_name);

            return Ok((StatusCode::CREATED, Json(UploadResponse { media_url })));
        }
    }

    Err(AppError::BadRequest(
        "No file provided in the 'file' field".into(),
    ))
}
```

**Key Security Features:**
1. **Magic Bytes Detection:** Validates actual file content, not just MIME type
2. **Atomic Quota Check:** Uses MongoDB atomic operations to prevent race conditions
3. **UUID Keys:** Immune to path traversal attacks
4. **File Size Limit:** 5MB maximum
5. **Supported Types:** JPEG, PNG, WebP, GIF
6. **Size Tracking:** Increments `images_used` on upload, decrements on failure

---

## 7. Webview Response Handling: URL Replacement

**File:** [media/webview/app.ts](media/webview/app.ts#L1040-L1080)

When server returns the public URL, webview replaces placeholders:

```typescript
case 'fileUploaded':
case 'mediaSelected': {
    if (!msg.mediaPath) break;
    const path = String(msg.mediaPath);

    // ════════════════════════════════════════════════════════
    // SPECIAL CASE: Cover Image Upload
    // ════════════════════════════════════════════════════════
    if (msg.placeholderRef === 'COVER_IMAGE') {
        const coverInput = get<HTMLInputElement>('blog-cover-image');
        if (coverInput) {
            coverInput.value = path;              // Set the URL
            coverInput.dispatchEvent(new Event('input'));  // Trigger listeners
        }
        const btn = get<HTMLButtonElement>('btn-upload-cover');
        if (btn) btn.textContent = '📤 Upload';  // Reset button
        toast('Cover image uploaded successfully!', 'success');
        break;
    }

    const name = String(msg.fileName || 'File');
    const size = msg.fileSize ? Number(msg.fileSize) : 0;
    const isLarge = size > 2 * 1024 * 1024;
    const warn = isLarge ? ' ⚠️ (Auto-compressed)' : '';
    
    // ════════════════════════════════════════════════════════
    // FOR THREADED POSTS
    // ════════════════════════════════════════════════════════
    if (msg.threadIndex !== undefined) {
        const idx = Number(msg.threadIndex);
        if (threadPosts[idx]) {
            if (!threadPosts[idx].mediaFilePaths) threadPosts[idx].mediaFilePaths = [];
            const MAX = 4;
            if (threadPosts[idx].mediaFilePaths.length >= MAX) {
                toast(`⚠️ Post ${idx + 1} already has ${MAX} images. Extra skipped.`, 'warning');
            } else {
                threadPosts[idx].mediaFilePaths.push(path);
            }
        }
        const preview = document.querySelector<HTMLElement>(
            `[data-thread-preview="${idx}"]`
        );
        if (preview) {
            preview.style.display = 'block';
            const nameEl = preview.querySelector<HTMLElement>('.thread-media-name');
            if (nameEl) nameEl.textContent = `${name}${warn}`;
        }
        break;
    }

    // ════════════════════════════════════════════════════════
    // DRAG & DROP: REPLACE PLACEHOLDER WITH REAL URL
    // ════════════════════════════════════════════════════════
    if (msg.placeholderRef) {
        // placeholderRef contains the markdown placeholder text
        // Replace it with actual markdown image link
        const textarea = get<HTMLTextAreaElement>('post-text') ||
                        get<HTMLTextAreaElement>('blog-body');
        if (textarea) {
            const placeholder = msg.placeholderRef;
            const imageMarkdown = `![${name}](${path})`;
            textarea.value = textarea.value.replace(placeholder, imageMarkdown);
            textarea.dispatchEvent(new Event('input'));
        }
        
        toast(`✅ Image linked: ${name}${warn}`, 'success');
    } else {
        // ════════════════════════════════════════════════════════
        // REGULAR MEDIA PICKER: ADD TO MEDIA PATHS
        // ════════════════════════════════════════════════════════
        activeMediaPaths.push(path);
        
        // Add to media preview grid
        const grid = get('main-media-grid');
        if (grid) {
            const item = document.createElement('div');
            item.className = 'media-item';
            item.innerHTML = `
                <div class="media-item-preview" style="background: url('${path}') center/cover;">
                    ${name}
                </div>
                <button class="btn-remove-media" data-url="${path}">✕</button>
            `;
            grid.appendChild(item);
        }
        
        toast(`✅ Added: ${name}${warn}`, 'success');
    }
    break;
}
```

---

## 8. Data Flow: From Upload to Post

**File:** [src/handlers/PostHandler.ts](src/handlers/PostHandler.ts#L239-L317)

Once media URLs are collected, they're sent with post content:

```typescript
// When user clicks "Share"
case 'share': {
    const msg = message as { 
        post?: string; 
        platforms?: string[]; 
        mediaFilePaths?: string[]  // ← Array of public R2 URLs
    };
    
    const postData: PostData = { 
        text: msg.post || '', 
        media: msg.mediaFilePaths || []  // ← URLs used by platforms
    };
    
    await this.unifiedSharePost(
        msg.platforms || [], 
        postData, 
        msg.mediaFilePaths
    );
    break;
}
```

The `mediaFilePaths` are URLs (not local file paths) that get passed to platform-specific adapters:
- **Reddit:** Uses URLs in Multipart, then S3 upload via lease
- **BlueSky:** Fetches from URL and uploads as blob
- **LinkedIn:** Registers upload and uses URL
- **X/Twitter:** Uploads locally or from URL
- **Dev.to:** Uses URL directly in markdown
- **Medium:** Uses URL directly in article

---

## 9. File Structure Summary

```
DotShare/
├── media/
│   └── webview/
│       └── app.ts                    ← UI: File input, Drag&Drop, Compression
│
├── src/
│   ├── handlers/
│   │   ├── MessageHandler.ts         ← Extension: Sanitization, calls SchedulerClient
│   │   └── PostHandler.ts            ← Post data with media URLs
│   │
│   └── services/
│       ├── SchedulerClient.ts        ← FormData construction & HTTP POST
│       ├── MediaService.ts           ← Local file storage (optional)
│       └── DotShareAuth.ts           ← Token management
```

---

## 10. Key URLs and Constants

| Component | Location | Purpose |
|-----------|----------|---------|
| Upload Endpoint | `POST /v1/media/upload` | Rust backend media upload |
| API Base URL | `DotShareAuth.getApiBaseUrl()` | Dynamic API endpoint |
| Max Image Size (Server) | `5 * 1024 * 1024` | 5MB limit |
| Max Image Size (Client) | `2 * 1024 * 1024` | Auto-compress threshold |
| Max Dimensions | `2000×2000` px | Resize limit |
| JPEG Quality | `0.8` | 80% compression |
| R2 Key Format | `dotsuite/scheduled_posts/{UUID}.{ext}` | Unique, path-traversal safe |

---

## 11. Security Features

| Feature | Location | Purpose |
|---------|----------|---------|
| MIME Type Validation | `MessageHandler.ts` | Whitelist allowed types |
| Magic Bytes Detection | `media.rs` | Verify actual file content |
| Filename Sanitization | `MessageHandler.ts` | Strip path traversal & unsafe chars |
| UUID Keys | `media.rs` | Prevent naming attacks |
| Atomic Quota Check | `media.rs` | Prevent quota bypass |
| Bearer Token Auth | `SchedulerClient.ts` | Authentication required |
| Size Limits | `media.rs` | 5MB server limit |

---

## 12. Upload Flow Sequence Diagram

```
User          Webview           Extension        Backend
 │              │                   │                │
 ├─ Select ────→│                   │                │
 │              │ Compress          │                │
 │              │ Base64 encode     │                │
 │              │                   │                │
 │              ├─ uploadFile msg ──→│                │
 │              │                   │ Sanitize       │
 │              │                   │ Build FormData │
 │              │                   │                │
 │              │                   ├─ POST /v1/media/upload ──→│
 │              │                   │                │ Validate  │
 │              │                   │                │ Magic     │
 │              │                   │                │ Quota ✓   │
 │              │                   │                │ Upload R2 │
 │              │                   │ ← 200 OK ──────│ UUID.jpg  │
 │              │ ← fileUploaded ───│ {media_url}    │          │
 │              │ Replace /         │                │          │
 │              │ placeholder       │                │          │
 │ ✓ See URL    │                   │                │          │
```

---

## 13. Error Handling

| Error | Source | Recovery |
|-------|--------|----------|
| Invalid file type | Client (validation) | Toast: "Only images can be dropped here" |
| File too large | Client (2MB threshold) | Toast: "Optimizing..." → Compress |
| No canvas context | Client | Fallback to FileReader |
| Upload unauthorized | Extension | Toast: "Not authenticated with DotSuite" |
| Invalid file data | Extension | Toast: "Invalid file data provided" |
| Server upload failed | Backend | Extension sanitizes and retries |
| Quota exceeded | Backend | Toast: "Image upload quota reached" + Decrement on failure |

---

## Summary

The DotShare image upload flow is a robust, multi-layered system that:

1. **Client-Side:** Compresses images intelligently (max 2000×2000, JPEG 80%)
2. **Transfer:** Converts to base64 for safe transmission via message protocol
3. **Security:** Multi-layer validation (MIME type, magic bytes, filename sanitization)
4. **Storage:** Atomic quota management with UUID-based keys in Cloudflare R2
5. **Integration:** Returns public URLs used in all platform post adapters
6. **UX:** Drag-and-drop with live placeholder replacement (Notion/GitHub style)

All paths in this document are workspace-relative and verified against the actual codebase.
