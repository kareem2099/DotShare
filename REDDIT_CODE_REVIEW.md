# Reddit Code Review - Bugs & Logic Issues

## 🔴 Critical Issues

### 1. **Incorrect MIME Type for Image Uploads** 
**File:** [src/platforms/reddit.ts](src/platforms/reddit.ts#L163)  
**Line:** ~163

```javascript
mimetype: supportedVideoExts.includes(ext)
    ? (ext === '.webm' ? 'video/webm' : 'video/mp4')
    : 'image/jpeg'  // ❌ BUG: Always uses 'image/jpeg' for ALL images
```

**Problem:** All image types (PNG, GIF, JPG, JPEG) are sent as `image/jpeg`. This will cause:
- PNG images to lose transparency
- GIFs to be treated as static images
- Quality issues and potential upload failures

**Fix:**
```javascript
const getMimeType = (ext: string): string => {
    const mimeMap: Record<string, string> = {
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
    };
    return mimeMap[ext] || 'image/jpeg';
};

const mimeType = supportedVideoExts.includes(ext)
    ? (ext === '.webm' ? 'video/webm' : 'video/mp4')
    : getMimeType(ext);

// Use in the request:
mimetype: mimeType
```

---

### 2. **Media URL Construction Issue**
**File:** [src/platforms/reddit.ts](src/platforms/reddit.ts#L194)  
**Line:** ~194

```javascript
url = `https://i.redd.it/${mediaIds[0]}`;
```

**Problem:** The `uploadRedditMedia()` function returns `args.fields.key`, which is an S3 key, NOT a direct i.redd.it URL. Using `i.redd.it` like this will result in 404 errors. Reddit doesn't use direct i.redd.it URLs for newly uploaded media; they use the S3 path or the processed Reddit media endpoint.

**Fix:** Use the Reddit media endpoint or store the proper media reference:
```javascript
// Option 1: Use Reddit's media rendering
url = `https://reddit.com/media/upload/${mediaIds[0]}`;

// Option 2: Keep the S3 key if Reddit supports it
url = mediaIds[0];

// Option 3: Fetch the actual URL from Reddit's API after upload
```

---

### 3. **URL Validation for Link Posts**
**File:** [src/platforms/reddit.ts](src/platforms/reddit.ts#L185)  
**Line:** ~185

```javascript
let url = postData.isSelfPost === false ? postData.text : undefined;
```

**Problem:** If `isSelfPost === false`, the code assumes `postData.text` is a valid URL. This can cause:
- Invalid URL posting if user makes a mistake
- No validation before sending to Reddit
- Reddit API will reject with unclear error messages

**Fix:**
```javascript
let url: string | undefined;
if (postData.isSelfPost === false) {
    // Validate URL format
    try {
        new URL(postData.text); // Will throw if invalid
        url = postData.text;
    } catch {
        throw new Error('For link posts, the text field must be a valid URL.');
    }
} else {
    url = undefined;
}
```

---

## 🟡 Medium Issues

### 4. **Parameter Naming Inconsistency in Delete Function**
**File:** [src/platforms/reddit.ts](src/platforms/reddit.ts#L655)  
**Line:** ~655

```javascript
// In deleteRedditPost:
const data = new URLSearchParams();
data.append('api_type', 'json');
data.append('id', postId);  // ⚠️ Should verify if this is correct

// In editRedditPost:
const data = new URLSearchParams();
data.append('api_type', 'json');
data.append('thing_id', postId);  // Different parameter name!
```

**Problem:** `editRedditPost` uses `thing_id` but `deleteRedditPost` uses `id`. Need to verify which is correct for the Reddit API. According to Reddit docs:
- `/api/del` (delete) expects `id` ✅
- `/api/editusertext` (edit) expects `thing_id` ✅

**Status:** This is actually correct, but the inconsistency is confusing. Add comments for clarity.

---

### 5. **Media Response Handling Not Matched to Upload Process**
**File:** [src/platforms/reddit.ts](src/platforms/reddit.ts#L127)  
**Line:** ~127

```javascript
uploadedAssets.push(args.fields.key);
```

**Problem:** The function returns `args.fields.key` from the S3 upload lease, but this key is then used in line 194:

```javascript
url = `https://i.redd.it/${mediaIds[0]}`;
```

This is incorrect. The `key` field is an S3 identifier, not an i.redd.it path. Reddit processes uploaded media and returns a different ID via the API response.

---

### 6. **Error Handling Doesn't Catch All Upload Failures**
**File:** [src/platforms/reddit.ts](src/platforms/reddit.ts#L102)  
**Line:** ~102-115

```javascript
if (!args) {
    Logger.warn('Failed to get upload lease for', mediaFile);
    continue;  // ⚠️ Silently skips without error
}
```

**Problem:** If media upload fails early (lease request fails), the function continues silently. The post will be created without the media, confusing users. Should either:
- Throw an error to alert the user
- Return which media files failed
- Retry the upload

---

### 7. **Missing Access Token Parameter Usage**
**File:** [src/platforms/reddit.ts](src/platforms/reddit.ts#L175)  
**Line:** ~175

```javascript
export async function shareToReddit(_accessToken: string, _refreshToken: string | undefined, postData: RedditPostData): Promise<string> {
    // ...
    const accessToken = await TokenManager.getValidToken('reddit');  // Ignores parameter!
```

**Problem:** The function accepts `_accessToken` parameter but ignores it and fetches a new token via `TokenManager`. This is confusing design:
- Parameter is marked with `_` (convention for unused)
- Why accept it if not using it?
- Wastes a request if token is already available

**Fix:**
```javascript
export async function shareToReddit(postData: RedditPostData): Promise<string> {
    const accessToken = await TokenManager.getValidToken('reddit');
    // ... rest of function
}
```

Or use the parameter if it's called locally:
```javascript
const accessToken = _accessToken || await TokenManager.getValidToken('reddit');
```

---

## 🟢 Minor Issues

### 8. **Hardcoded User-Agent in Multiple Places**
**File:** Multiple locations  

Each request hardcodes `'User-Agent': 'DotShare/1.0'` or similar. Consider centralizing:

```javascript
const REDDIT_HEADERS = {
    'User-Agent': 'DotShare/1.0 (by /u/DotShareApp)',
    'Accept': 'application/json'
};

function getAuthHeaders(accessToken: string) {
    return {
        ...REDDIT_HEADERS,
        'Authorization': `Bearer ${accessToken}`
    };
}
```

---

### 9. **Inconsistent Error Handling**
**File:** [src/platforms/reddit.ts](src/platforms/reddit.ts#L330)  

Some functions return `[]` on error, others throw. Be consistent:
- `getRedditFlairs` → returns `[]` ✅
- `editRedditPost` → throws error ✅
- `getRedditUserPosts` → returns `[]` ✅

This is inconsistent with command handlers which expect errors to be thrown.

---

## Summary of Fixes Needed

| Issue | Severity | Fix Time |
|-------|----------|----------|
| Wrong MIME type for images | 🔴 Critical | 5 min |
| Invalid media URL construction | 🔴 Critical | 10 min |
| Missing URL validation for link posts | 🔴 Critical | 10 min |
| Response handling mismatch | 🟡 Medium | 15 min |
| Unused parameter convention | 🟢 Minor | 5 min |
| Hardcoded headers | 🟢 Minor | 10 min |

**Total estimated fix time: ~50 minutes**
