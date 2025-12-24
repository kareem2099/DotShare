import { MediaFile } from '../../../src/types';
import { formatFileSize, attachedFile, uploadArea, fileInput, fileNameSpan, fileSizeSpan, mediaAttachment, showStatus, removeMediaBtn } from '../core/utils';

interface VSCodeAPI {
    postMessage(message: unknown): void;
}

declare const vscode: VSCodeAPI;

// Lazy vscode accessor to avoid undefined issues
const getVscode = () => vscode;

export let attachedMediaPath: string | null = null;
// Store attached media files for sharing
export let attachedMediaFiles: string[] = [];

export function attachMultipleMedia(mediaFiles: MediaFile[]): void {
    // Store the file paths for sharing
    attachedMediaFiles = mediaFiles.map(file => file.mediaFilePath);

    if (attachedFile) attachedFile.style.display = 'flex';
    if (uploadArea) uploadArea.style.display = 'none';

    if (mediaFiles.length === 1) {
        // Single file - use existing UI
        if (fileNameSpan) fileNameSpan.textContent = mediaFiles[0].fileName;
        if (fileSizeSpan) fileSizeSpan.textContent = formatFileSize(mediaFiles[0].fileSize);
    } else {
        // Multiple files - show count
        const totalSize = mediaFiles.reduce((sum, file) => sum + file.fileSize, 0);
        if (fileNameSpan) fileNameSpan.textContent = `${mediaFiles.length} files selected`;
        if (fileSizeSpan) fileSizeSpan.textContent = formatFileSize(totalSize);
    }

    // Send all filesystem paths for storage
    const mediaFilePaths = mediaFiles.map(file => file.mediaFilePath);
    getVscode()?.postMessage({ command: 'attachMedia', mediaFilePaths });
}

export function attachMedia(mediaPath: string, mediaFilePath: string, fileName: string, fileSize: number): void {
    // Store the file path for sharing
    attachedMediaFiles = [mediaFilePath];

    // mediaPath is for display, mediaFilePath is for file operations
    attachedMediaPath = mediaPath; // Keep for potential future use in UI
    if (attachedFile) attachedFile.style.display = 'flex';
    if (uploadArea) uploadArea.style.display = 'none';
    if (fileNameSpan) fileNameSpan.textContent = fileName;
    if (fileSizeSpan) fileSizeSpan.textContent = formatFileSize(fileSize);
    // Send filesystem path for storage
    getVscode()?.postMessage({ command: 'attachMedia', mediaFilePath });
}

export function removeMedia(): void {
    // Clear attached media files for sharing
    attachedMediaFiles = [];

    attachedMediaPath = null;
    if (attachedFile) attachedFile.style.display = 'none';
    if (uploadArea) uploadArea.style.display = 'flex';
    getVscode()?.postMessage({ command: 'removeMedia' });
}

// Get attached media for sharing
export function getAttachedMediaPaths(): string[] {
    return [...attachedMediaFiles]; // Return a copy
}

export function showMediaAttachment(): void {
    // Media attachment is now always visible
    if (mediaAttachment) {
        mediaAttachment.style.display = 'block';
    }
}

export function hideMediaAttachment(): void {
    if (mediaAttachment) mediaAttachment.style.display = 'none';
}

export function validateFile(file: File): boolean {
    const maxSize = 8 * 1024 * 1024; // 8MB limit
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'video/mp4'];

    if (file.size > maxSize) {
        showStatus('File size must be less than 8MB.', 'error');
        return false;
    }

    if (!allowedTypes.includes(file.type)) {
        showStatus('Only JPG, PNG, GIF images and MP4 videos are supported.', 'error');
        return false;
    }

    return true;
}

// Initialize media upload event listeners
export function initializeMediaUpload(): void {
    if (!mediaAttachment) return;

    // Add event listener for select media files button
    const selectMediaBtn = document.getElementById("selectMediaBtn") as HTMLButtonElement;
    if (selectMediaBtn) {
        selectMediaBtn.addEventListener('click', () => {
            showStatus('Opening file dialog...', 'success');
            getVscode()?.postMessage({ command: "selectMediaFiles" });
        });
    }

    // Add event listener for remove media button
    if (removeMediaBtn) {
        removeMediaBtn.addEventListener('click', removeMedia);
    }

    // Click on media attachment area triggers file input
    mediaAttachment.addEventListener('click', (e) => {
        // Don't trigger if clicking on an existing attached file or its children
        if ((e.target as HTMLElement)?.closest('#attachedFile')) {
            return;
        }
        // Don't trigger if clicking on buttons or links
        const target = e.target as HTMLElement;
        if (target.tagName === 'BUTTON' || target.tagName === 'A') {
            return;
        }
        // Don't trigger if we already have a file attached and not in upload area
        if (attachedFile && attachedFile.style.display !== 'none') {
            const attachedFileRect = attachedFile.getBoundingClientRect();
            if (e.clientX >= attachedFileRect.left && e.clientX <= attachedFileRect.right &&
                e.clientY >= attachedFileRect.top && e.clientY <= attachedFileRect.bottom) {
                return;
            }
        }
        if (fileInput) fileInput.click();
    });

    // Drag and drop handlers (only if uploadArea exists)
    if (uploadArea) {
        uploadArea.addEventListener('dragover', handleDragOver);
        uploadArea.addEventListener('drop', handleDrop);
        uploadArea.addEventListener('dragenter', handleDragEnter);
        uploadArea.addEventListener('dragleave', handleDragLeave);
    }

    // File input change handler
    if (fileInput) fileInput.addEventListener('change', handleFileSelection);
}

// Drag and drop event handlers
function handleDragOver(e: DragEvent): void {
    e.preventDefault();
    e.stopPropagation();

    if (uploadArea) {
        uploadArea.classList.add('drag-over');
    }
}

function handleDragEnter(e: DragEvent): void {
    e.preventDefault();
    e.stopPropagation();

    if (uploadArea) {
        uploadArea.classList.add('drag-over');
    }
}

function handleDragLeave(e: DragEvent): void {
    e.preventDefault();
    e.stopPropagation();

    // Only remove drag-over class if we're leaving the uploadArea entirely
    // (not just moving over a child element)
    if (uploadArea && e.target === uploadArea) {
        uploadArea.classList.remove('drag-over');
    }
}

function handleDrop(e: DragEvent): void {
    e.preventDefault();
    e.stopPropagation();

    if (uploadArea) {
        uploadArea.classList.remove('drag-over');
    }

    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
        processSelectedFiles(files);
    }
}

// File input change handler (for click-to-browse)
function handleFileSelection(e: Event): void {
    const target = e.target as HTMLInputElement;
    const files = target.files;
    if (files && files.length > 0) {
        processSelectedFiles(files);
    }
}

// Process selected or dropped files
function processSelectedFiles(files: FileList): void {
    const fileArray = Array.from(files);

    // Validate all files first
    const validFiles = fileArray.filter(validateFile);

    if (validFiles.length === 0) {
        showStatus('No valid files selected. Please choose JPG, PNG, GIF images or MP4 videos under 8MB.', 'error');
        return;
    }

    if (validFiles.length === 1) {
        // Single file
        const file = validFiles[0];
        // Convert to VS Code compatible format by sending through webview message
        handleFileUpload(file);
    } else if (validFiles.length > 1) {
        // Multiple files
        showStatus(`${validFiles.length} files selected. Uploading first file...`, 'success');
        handleFileUpload(validFiles[0]); // Upload first file for now
    }
}

// Handle individual file upload by sending to VS Code
async function handleFileUpload(file: File): Promise<void> {
    try {
        showStatus(`Processing ${file.name}...`, 'success');

        // Convert file to base64 for transmission to extension host
        const arrayBuffer = await file.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        const base64Data = btoa(String.fromCharCode(...uint8Array));

        // Send file data directly to VS Code for processing
        const fileData = {
            name: file.name,
            size: file.size,
            type: file.type,
            base64Data: base64Data
        };

        // Send to VS Code for processing
        getVscode()?.postMessage({
            command: 'uploadFile',
            file: fileData
        });
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        showStatus(`Failed to process ${file.name}: ${errorMessage}`, 'error');
    }
}

// Add CSS class for drag-over visual feedback
export function addDragOverStyles(): void {
    const style = document.createElement('style');
    style.textContent = `
        .modern-upload-area.drag-over {
            border-color: #007acc;
            background-color: rgba(0, 122, 204, 0.05);
            transform: scale(1.02);
        }
        .modern-upload-area.drag-over .upload-text {
            color: #007acc;
            font-weight: 600;
        }
    `;
    document.head.appendChild(style);
}
