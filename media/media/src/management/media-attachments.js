import { formatFileSize, attachedFile, uploadArea, fileNameSpan, fileSizeSpan, mediaAttachment, postText } from '../core/utils';
// @ts-ignore
const vscode = acquireVsCodeApi();
export let attachedMediaPath = null;
export function attachMultipleMedia(mediaFiles) {
    attachedFile.style.display = 'flex';
    uploadArea.style.display = 'none';
    if (mediaFiles.length === 1) {
        // Single file - use existing UI
        fileNameSpan.textContent = mediaFiles[0].fileName;
        fileSizeSpan.textContent = formatFileSize(mediaFiles[0].fileSize);
    }
    else {
        // Multiple files - show count
        const totalSize = mediaFiles.reduce((sum, file) => sum + file.fileSize, 0);
        fileNameSpan.textContent = `${mediaFiles.length} files selected`;
        fileSizeSpan.textContent = formatFileSize(totalSize);
    }
    // Send all filesystem paths for storage
    const mediaFilePaths = mediaFiles.map(file => file.mediaFilePath);
    vscode.postMessage({ command: 'attachMedia', mediaFilePaths });
}
export function attachMedia(mediaPath, mediaFilePath, fileName, fileSize) {
    // mediaPath is for display, mediaFilePath is for file operations
    attachedMediaPath = mediaPath; // Keep for potential future use in UI
    attachedFile.style.display = 'flex';
    uploadArea.style.display = 'none';
    fileNameSpan.textContent = fileName;
    fileSizeSpan.textContent = formatFileSize(fileSize);
    // Send filesystem path for storage
    vscode.postMessage({ command: 'attachMedia', mediaFilePath });
}
export function removeMedia() {
    attachedMediaPath = null;
    attachedFile.style.display = 'none';
    uploadArea.style.display = 'flex';
    vscode.postMessage({ command: 'removeMedia' });
}
export function showMediaAttachment() {
    if (postText && postText.value.trim()) {
        mediaAttachment.style.display = 'block';
    }
}
export function hideMediaAttachment() {
    mediaAttachment.style.display = 'none';
}
export function validateFile(file) {
    const maxSize = 8 * 1024 * 1024; // 8MB limit
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'video/mp4'];
    if (file.size > maxSize) {
        // showStatus is not imported, perhaps import or call
        console.error('File size must be less than 8MB.'); // placeholder
        return false;
    }
    if (!allowedTypes.includes(file.type)) {
        console.error('Only JPG, PNG, GIF images and MP4 videos are supported.'); // placeholder
        return false;
    }
    return true;
}
