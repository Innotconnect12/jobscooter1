const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * File Handler Utility
 * Provides functions for file operations, validation, and cleanup
 */

class FileHandler {
    constructor() {
        this.allowedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
        this.allowedDocumentTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
        this.allowedVideoTypes = ['video/mp4', 'video/mov', 'video/avi', 'video/quicktime'];
        this.maxFileSize = 10 * 1024 * 1024; // 10MB
    }

    /**
     * Validate file type and size
     */
    validateFile(file, allowedTypes = null) {
        if (!file) {
            throw new Error('No file provided');
        }

        // Check file size
        if (file.size > this.maxFileSize) {
            throw new Error(`File size exceeds maximum limit of ${this.maxFileSize / (1024 * 1024)}MB`);
        }

        // Check file type
        const typesToCheck = allowedTypes || this.getAllowedTypes(file.fieldname);
        if (!typesToCheck.includes(file.mimetype)) {
            throw new Error(`File type ${file.mimetype} is not allowed. Allowed types: ${typesToCheck.join(', ')}`);
        }

        return true;
    }

    /**
     * Get allowed file types based on field name
     */
    getAllowedTypes(fieldName) {
        if (fieldName === 'id_document') {
            return this.allowedDocumentTypes;
        } else if (fieldName === 'certificate') {
            return this.allowedDocumentTypes;
        } else if (fieldName.includes('profile_picture') || fieldName.includes('image')) {
            return this.allowedImageTypes;
        } else if (fieldName.includes('video') || fieldName === 'video_intro') {
            return this.allowedVideoTypes;
        } else {
            return [...this.allowedDocumentTypes, ...this.allowedImageTypes, ...this.allowedVideoTypes];
        }
    }

    /**
     * Generate unique filename
     */
    generateUniqueFilename(originalName, prefix = '') {
        const extension = path.extname(originalName);
        const timestamp = Date.now();
        const random = crypto.randomBytes(8).toString('hex');
        const baseName = path.basename(originalName, extension).replace(/[^a-zA-Z0-9]/g, '_');

        return `${prefix}${baseName}_${timestamp}_${random}${extension}`;
    }

    /**
     * Ensure directory exists
     */
    ensureDirectoryExists(dirPath) {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
            console.log(`Created directory: ${dirPath}`);
        }
    }

    /**
     * Get file info
     */
    getFileInfo(filePath) {
        try {
            const stats = fs.statSync(filePath);
            return {
                size: stats.size,
                created: stats.birthtime,
                modified: stats.mtime,
                extension: path.extname(filePath),
                filename: path.basename(filePath),
                directory: path.dirname(filePath)
            };
        } catch (error) {
            console.error('Error getting file info:', error);
            return null;
        }
    }

    /**
     * Check if file exists
     */
    fileExists(filePath) {
        try {
            return fs.existsSync(filePath);
        } catch (error) {
            return false;
        }
    }

    /**
     * Delete file safely
     */
    deleteFile(filePath) {
        try {
            if (this.fileExists(filePath)) {
                fs.unlinkSync(filePath);
                console.log(`Deleted file: ${filePath}`);
                return true;
            }
            return false;
        } catch (error) {
            console.error('Error deleting file:', error);
            return false;
        }
    }

    /**
     * Clean up old files in directory
     */
    cleanupOldFiles(directory, maxAgeHours = 24) {
        try {
            const files = fs.readdirSync(directory);
            const now = Date.now();
            const maxAge = maxAgeHours * 60 * 60 * 1000;

            files.forEach(file => {
                const filePath = path.join(directory, file);
                const stats = fs.statSync(filePath);

                if (now - stats.mtime.getTime() > maxAge) {
                    this.deleteFile(filePath);
                }
            });

            console.log(`Cleaned up old files in ${directory}`);
        } catch (error) {
            console.error('Error cleaning up files:', error);
        }
    }

    /**
     * Get file extension from mimetype
     */
    getExtensionFromMimeType(mimeType) {
        const mimeToExt = {
            'image/jpeg': '.jpg',
            'image/jpg': '.jpg',
            'image/png': '.png',
            'image/gif': '.gif',
            'application/pdf': '.pdf',
            'video/mp4': '.mp4',
            'video/mov': '.mov',
            'video/avi': '.avi',
            'video/quicktime': '.mov'
        };

        return mimeToExt[mimeType] || '.bin';
    }

    /**
     * Validate image dimensions (for profile pictures)
     */
    async validateImageDimensions(filePath, maxWidth = 2000, maxHeight = 2000, minWidth = 100, minHeight = 100) {
        return new Promise((resolve, reject) => {
            // In a real implementation, you would use a library like sharp or gm
            // For now, we'll just check if it's an image file
            const ext = path.extname(filePath).toLowerCase();
            const validImageExts = ['.jpg', '.jpeg', '.png', '.gif'];

            if (validImageExts.includes(ext)) {
                resolve({
                    width: 800, // Mock values
                    height: 600,
                    valid: true
                });
            } else {
                resolve({
                    width: 0,
                    height: 0,
                    valid: false,
                    error: 'Not a valid image file'
                });
            }
        });
    }

    /**
     * Extract text from PDF (placeholder for future implementation)
     */
    async extractTextFromPDF(filePath) {
        // In a real implementation, you would use pdf-parse or similar
        return new Promise((resolve, reject) => {
            // Mock implementation
            setTimeout(() => {
                resolve({
                    text: 'Mock extracted text from PDF document',
                    pages: 1,
                    confidence: 0.85
                });
            }, 1000);
        });
    }

    /**
     * Generate file checksum
     */
    generateChecksum(filePath) {
        try {
            const fileBuffer = fs.readFileSync(filePath);
            const hashSum = crypto.createHash('sha256');
            hashSum.update(fileBuffer);
            return hashSum.digest('hex');
        } catch (error) {
            console.error('Error generating checksum:', error);
            return null;
        }
    }

    /**
     * Compress image (placeholder for future implementation)
     */
    async compressImage(inputPath, outputPath, quality = 80) {
        // In a real implementation, you would use sharp
        return new Promise((resolve, reject) => {
            // For now, just copy the file
            try {
                fs.copyFileSync(inputPath, outputPath);
                resolve({
                    originalSize: this.getFileInfo(inputPath).size,
                    compressedSize: this.getFileInfo(outputPath).size,
                    compressionRatio: 1.0
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Get directory size
     */
    getDirectorySize(directory) {
        let totalSize = 0;

        try {
            const files = fs.readdirSync(directory);

            files.forEach(file => {
                const filePath = path.join(directory, file);
                const stats = fs.statSync(filePath);

                if (stats.isFile()) {
                    totalSize += stats.size;
                } else if (stats.isDirectory()) {
                    totalSize += this.getDirectorySize(filePath);
                }
            });
        } catch (error) {
            console.error('Error calculating directory size:', error);
        }

        return totalSize;
    }

    /**
     * Move file
     */
    moveFile(sourcePath, destinationPath) {
        try {
            // Ensure destination directory exists
            this.ensureDirectoryExists(path.dirname(destinationPath));

            fs.renameSync(sourcePath, destinationPath);
            console.log(`Moved file from ${sourcePath} to ${destinationPath}`);
            return true;
        } catch (error) {
            console.error('Error moving file:', error);
            return false;
        }
    }

    /**
     * Copy file
     */
    copyFile(sourcePath, destinationPath) {
        try {
            // Ensure destination directory exists
            this.ensureDirectoryExists(path.dirname(destinationPath));

            fs.copyFileSync(sourcePath, destinationPath);
            console.log(`Copied file from ${sourcePath} to ${destinationPath}`);
            return true;
        } catch (error) {
            console.error('Error copying file:', error);
            return false;
        }
    }
}

module.exports = new FileHandler();
