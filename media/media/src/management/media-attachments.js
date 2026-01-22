import { formatFileSize, attachedFile, uploadArea, fileNameSpan, fileSizeSpan, mediaAttachment, postText, removeMediaBtn } from '../core/utils';

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
        Logger.error('File size must be less than 8MB.'); // placeholder
        return false;
    }
    if (!allowedTypes.includes(file.type)) {
        Logger.error('Only JPG, PNG, GIF images and MP4 videos are supported.'); // placeholder
        return false;
    }
    return true;
}

// Initialize media upload event listeners
function getVscode() {
    return vscode;
}

export function initializeMediaUpload() {
    Logger.info('initializeMediaUpload called');
    if (!mediaAttachment || !uploadArea) {
        Logger.warn('mediaAttachment or uploadArea not found:', mediaAttachment, uploadArea);
        return;
    }

    // Add event listener for select media files button
    const selectMediaBtn = document.getElementById("selectMediaBtn");
    Logger.info('selectMediaBtn found:', !!selectMediaBtn);
    if (selectMediaBtn) {
        Logger.info('Adding click event listener to selectMediaBtn');
        selectMediaBtn.addEventListener('click', (e) => {
            Logger.info('Select Files button clicked, sending selectMediaFiles message');
            e.preventDefault();
            getVscode().postMessage({ command: "selectMediaFiles" });
        });
        Logger.info('Select Media Files button event listener attached');
    } else {
        Logger.warn('Select Files button not found in DOM');
    }

    // Add event listener for remove media button
    if (removeMediaBtn) {
        removeMediaBtn.addEventListener('click', removeMedia);
    }

    // Click on media attachment area triggers file input
    mediaAttachment.addEventListener('click', (e) => {
        // Don't trigger if clicking on an existing attached file or its children
        if (e.target.closest('#attachedFile')) {
            return;
        }
        // Don't trigger if clicking on buttons or links
        const target = e.target;
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
        // For now, just log - file input functionality would need to be implemented
        Logger.info('Media attachment area clicked');
    });

    // Drag and drop handlers (only if uploadArea exists)
    if (uploadArea) {
        uploadArea.addEventListener('dragover', handleDragOver);
        uploadArea.addEventListener('drop', handleDrop);
        uploadArea.addEventListener('dragenter', handleDragEnter);
        uploadArea.addEventListener('dragleave', handleDragLeave);
    }

    Logger.info('Media upload event listeners initialized');
}


// Drag and drop event handlers
function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();

    if (uploadArea) {
        uploadArea.classList.add('drag-over');
    }
}

function handleDragEnter(e) {
    e.preventDefault();
    e.stopPropagation();

    if (uploadArea) {
        uploadArea.classList.add('drag-over');
    }
}

function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();

    // Only remove drag-over class if we're leaving the uploadArea entirely
    // (not just moving over a child element)
    if (uploadArea && e.target === uploadArea) {
        uploadArea.classList.remove('drag-over');
    }
}

function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();

    if (uploadArea) {
        uploadArea.classList.remove('drag-over');
    }

    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
        Logger.info('Files dropped:', files.length);
        // processSelectedFiles would need to be implemented
    }
}

// Add CSS class for drag-over visual feedback
export function addDragOverStyles() {
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
