class ImageUploader {
    constructor() {
        // 初始化DOM元素引用
        this.dropZone = document.getElementById('dropZone');
        this.fileInput = document.getElementById('fileInput');
        this.fileList = document.getElementById('fileList');
        this.uploadProgress = document.getElementById('uploadProgress');
        this.progressBar = this.uploadProgress.querySelector('.progress-bar');
        this.progressText = this.uploadProgress.querySelector('.progress-text');
        this.previewModal = document.getElementById('previewModal');
        this.searchInput = document.getElementById('searchInput');
        this.prevPageBtn = document.getElementById('prevPage');
        this.nextPageBtn = document.getElementById('nextPage');
        this.pageInfo = document.getElementById('pageInfo');
        this.toastContainer = document.getElementById('toastContainer');
        this.viewButtons = document.querySelectorAll('.view-btn');

        // 初始化状态变量
        this.currentPage = 1;
        this.totalPages = 1;
        this.currentView = 'grid';
        this.files = [];
        this.filteredFiles = [];
        this.uploadQueue = [];
        this.isUploading = false;

        // 初始化方法
        this.initEventListeners();
        this.loadFileList();
    }

    initEventListeners() {
        // 拖放上传事件
        this.dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.dropZone.classList.add('dragover');
        });

        this.dropZone.addEventListener('dragleave', () => {
            this.dropZone.classList.remove('dragover');
        });

        this.dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            this.dropZone.classList.remove('dragover');
            if (e.dataTransfer.files.length > 0) {
                this.handleFiles(e.dataTransfer.files);
            }
        });

        // 点击上传事件
        this.dropZone.addEventListener('click', () => {
            this.fileInput.click();
        });

        this.fileInput.addEventListener('change', () => {
            if (this.fileInput.files.length > 0) {
                this.handleFiles(this.fileInput.files);
            }
        });

        // 搜索功能
        this.searchInput.addEventListener('input', () => {
            this.filterFiles();
        });

        // 视图切换
        this.viewButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                this.viewButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentView = btn.dataset.view;
                this.fileList.classList.toggle('list-view', this.currentView === 'list');
                localStorage.setItem('preferredView', this.currentView);
            });
        });

        // 分页控制
        this.prevPageBtn.addEventListener('click', () => {
            if (this.currentPage > 1) {
                this.currentPage--;
                this.updatePagination();
                this.renderFileList();
            }
        });

        this.nextPageBtn.addEventListener('click', () => {
            if (this.currentPage < this.totalPages) {
                this.currentPage++;
                this.updatePagination();
                this.renderFileList();
            }
        });

        // 恢复用户偏好的视图模式
        const preferredView = localStorage.getItem('preferredView');
        if (preferredView) {
            this.currentView = preferredView;
            const activeBtn = document.querySelector(`.view-btn[data-view="${preferredView}"]`);
            if (activeBtn) {
                this.viewButtons.forEach(b => b.classList.remove('active'));
                activeBtn.classList.add('active');
                this.fileList.classList.toggle('list-view', preferredView === 'list');
            }
        }
    }

    async handleFiles(files) {
        // 验证文件
        const validFiles = Array.from(files).filter(file => {
            const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
            if (!validTypes.includes(file.type)) {
                this.showToast(`不支持的文件类型: ${file.name}`, 'error');
                return false;
            }
            if (file.size > 20 * 1024 * 1024) {
                this.showToast(`文件过大: ${file.name} (最大20MB)`, 'error');
                return false;
            }
            return true;
        });

        if (validFiles.length === 0) return;

        // 添加到上传队列
        this.uploadQueue.push(...validFiles);
        this.showToast(`已添加 ${validFiles.length} 个文件到上传队列`, 'success');

        // 如果当前没有在上传，则开始上传
        if (!this.isUploading) {
            this.processUploadQueue();
        }
    }

    async processUploadQueue() {
        if (this.uploadQueue.length === 0) {
            this.isUploading = false;
            return;
        }

        this.isUploading = true;
        const file = this.uploadQueue.shift();
        
        try {
            this.showUploadProgress(true);
            const uploadedFile = await this.uploadFile(file);
            
            // 添加到文件列表
            this.files.unshift(uploadedFile);
            this.filteredFiles.unshift(uploadedFile);
            
            // 更新分页和渲染
            this.totalPages = Math.ceil(this.filteredFiles.length / 8);
            this.updatePagination();
            this.renderFileList();
            
            this.showToast(`${file.name} 上传成功`, 'success');
        } catch (error) {
            console.error('上传失败:', error);
            this.showToast(`${file.name} 上传失败`, 'error');
        } finally {
            this.showUploadProgress(false);
            this.processUploadQueue(); // 处理下一个文件
        }
    }

    async uploadFile(file) {
        return new Promise((resolve, reject) => {
            // 模拟上传进度
            let progress = 0;
            const interval = setInterval(() => {
                progress += Math.random() * 10;
                if (progress >= 100) {
                    progress = 100;
                    clearInterval(interval);
                    
                    // 模拟上传成功后的响应
                    setTimeout(() => {
                        const uploadedFile = {
                            id: Date.now() + Math.floor(Math.random() * 1000),
                            name: file.name,
                            url: URL.createObjectURL(file),
                            size: this.formatFileSize(file.size),
                            dimensions: this.getRandomDimensions(),
                            uploadedAt: new Date().toLocaleString(),
                            file: file
                        };
                        resolve(uploadedFile);
                    }, 300);
                }
                this.updateProgress(progress);
            }, 200);
            
            // 实际项目中应该使用fetch或axios
            /*
            const formData = new FormData();
            formData.append('file', file);
            
            fetch('/api/upload', {
                method: 'POST',
                body: formData,
                onUploadProgress: (progressEvent) => {
                    const percent = Math.round(
                        (progressEvent.loaded * 100) / progressEvent.total
                    );
                    this.updateProgress(percent);
                }
            })
            .then(response => response.json())
            .then(data => {
                clearInterval(interval);
                resolve(data);
            })
            .catch(error => {
                clearInterval(interval);
                reject(error);
            });
            */
        });
    }

    updateProgress(percent) {
        this.progressBar.style.width = `${percent}%`;
        this.progressText.textContent = `${percent}%`;
    }

    showUploadProgress(show) {
        this.uploadProgress.style.display = show ? 'block' : 'none';
        if (!show) {
            this.updateProgress(0);
        }
    }

    async loadFileList() {
        try {
            // 模拟API请求获取文件列表
            // const response = await fetch('/api/files');
            // const data = await response.json();
            // this.files = data.files;
            // this.totalPages = data.totalPages;
            
            // 模拟数据
            this.files = [
                this.createMockFile(1, '风景照片.jpg', 'https://picsum.photos/id/10/800/600', '1.2MB', '1920x1080'),
                this.createMockFile(2, '人像照片.png', 'https://picsum.photos/id/11/600/800', '2.5MB', '1080x1920'),
                this.createMockFile(3, '头像.webp', 'https://picsum.photos/id/12/500/500', '350KB', '500x500'),
                this.createMockFile(4, '横幅广告.jpg', 'https://picsum.photos/id/13/1200/400', '3.1MB', '2560x1440'),
                this.createMockFile(5, '产品图片.png', 'https://picsum.photos/id/14/800/600', '1.8MB', '1200x800'),
                this.createMockFile(6, '自然风光.jpg', 'https://picsum.photos/id/15/800/600', '2.3MB', '1920x1080'),
                this.createMockFile(7, '城市景观.jpg', 'https://picsum.photos/id/16/800/600', '2.7MB', '1920x1080'),
                this.createMockFile(8, '抽象艺术.png', 'https://picsum.photos/id/17/800/600', '1.5MB', '1200x800'),
            ];
            
            this.filteredFiles = [...this.files];
            this.totalPages = Math.ceil(this.filteredFiles.length / 5);
            this.updatePagination();
            this.renderFileList();
        } catch (error) {
            console.error('加载文件列表失败:', error);
            this.showToast('加载文件列表失败', 'error');
        }
    }

    createMockFile(id, name, url, size, dimensions) {
        return {
            id,
            name,
            url,
            size,
            dimensions,
            uploadedAt: new Date(Date.now() - Math.floor(Math.random() * 7 * 24 * 60 * 60 * 1000)).toLocaleString()
        };
    }

    filterFiles() {
        const searchTerm = this.searchInput.value.toLowerCase().trim();
        if (!searchTerm) {
            this.filteredFiles = [...this.files];
        } else {
            this.filteredFiles = this.files.filter(file => 
                file.name.toLowerCase().includes(searchTerm) ||
                file.uploadedAt.toLowerCase().includes(searchTerm)
            );
        }
        this.totalPages = Math.ceil(this.filteredFiles.length / 8);
        this.currentPage = 1;
        this.updatePagination();
        this.renderFileList();
    }

    updatePagination() {
        this.prevPageBtn.disabled = this.currentPage <= 1;
        this.nextPageBtn.disabled = this.currentPage >= this.totalPages;
        this.pageInfo.textContent = `${this.currentPage}/${this.totalPages}`;
    }

    renderFileList() {
        this.fileList.innerHTML = '';
        
        // 分页逻辑
        const itemsPerPage = 5;
        const startIndex = (this.currentPage - 1) * itemsPerPage;
        const endIndex = Math.min(startIndex + itemsPerPage, this.filteredFiles.length);
        const filesToShow = this.filteredFiles.slice(startIndex, endIndex);
        
        if (filesToShow.length === 0) {
            this.fileList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-images"></i>
                    <p>没有找到匹配的图片</p>
                </div>
            `;
            return;
        }
        
        filesToShow.forEach(file => {
            const fileItem = document.createElement('div');
            fileItem.className = `file-item ${this.currentView === 'list' ? 'list-view' : ''}`;
            fileItem.innerHTML = `
                <div class="file-thumbnail" data-id="${file.id}">
                    <img src="${file.url}" alt="${file.name}" loading="lazy">
                    <div class="file-overlay">
                        <button class="btn-preview" data-id="${file.id}" title="预览"><i class="fas fa-eye"></i></button>
                        <button class="btn-copy" data-url="${file.url}" title="复制链接"><i class="fas fa-link"></i></button>
                    </div>
                </div>
                <div class="file-meta">
                    <div class="file-name">${file.name}</div>
                    <div class="file-size">${file.size}</div>
                </div>
            `;
            
            this.fileList.appendChild(fileItem);
        });
        
        // 添加预览事件
        document.querySelectorAll('.btn-preview').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const fileId = e.currentTarget.getAttribute('data-id');
                this.showPreviewModal(fileId);
            });
        });
        
        // 添加复制链接事件
        document.querySelectorAll('.btn-copy').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const url = e.currentTarget.getAttribute('data-url');
                this.copyToClipboard(url);
                this.showToast('链接已复制到剪贴板', 'success');
            });
        });
    }

    showPreviewModal(fileId) {
        const file = this.files.find(f => f.id == fileId) || {
            id: fileId,
            name: `示例图片-${fileId}.jpg`,
            url: `https://picsum.photos/id/${fileId}/800/600`,
            dimensions: this.getRandomDimensions(),
            size: this.formatFileSize(Math.floor(Math.random() * 3000) * 1024),
            uploadedAt: new Date().toLocaleString()
        };

        const modal = this.previewModal;
        const previewImg = modal.querySelector('.preview-image');
        
        // 显示加载状态
        previewImg.src = '';
        previewImg.style.display = 'none';
        modal.querySelector('.image-container').classList.add('loading');
        
        // 预加载图片
        const img = new Image();
        img.src = file.url;
        img.onload = () => {
            previewImg.src = file.url;
            previewImg.style.display = 'block';
            modal.querySelector('.image-container').classList.remove('loading');
            modal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
        };
        img.onerror = () => {
            previewImg.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%236c757d"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zm-5-7v-1.5c0-.83-.67-1.5-1.5-1.5.83 0 1.5-.67 1.5-1.5V7c0-1.11-.9-2-2-2h-4v2h4v2h-2v2h2v2h-4v2h4c1.1 0 2-.89 2-2z"/></svg>';
            previewImg.style.display = 'block';
            modal.querySelector('.image-container').classList.remove('loading');
            modal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
        };

        // 更新文件信息
        modal.querySelector('.file-name').textContent = file.name;
        modal.querySelector('.file-dimension').textContent = file.dimensions;
        modal.querySelector('.file-size').textContent = file.size;
        modal.querySelector('.file-date').textContent = file.uploadedAt;
        
        // 设置操作按钮事件
        const copyBtn = modal.querySelector('.btn-copy');
        const downloadBtn = modal.querySelector('.btn-download');
        const deleteBtn = modal.querySelector('.btn-delete');
        
        copyBtn.onclick = () => {
            this.copyToClipboard(file.url);
            this.showToast('链接已复制到剪贴板', 'success');
        };
        
        downloadBtn.onclick = () => {
            this.downloadFile(file.url, file.name);
        };
        
        deleteBtn.onclick = () => {
            if (confirm(`确定要删除 "${file.name}" 吗？此操作不可撤销。`)) {
                this.deleteFile(fileId);
            }
        };
        
        // 关闭按钮事件
        const closeModal = () => {
            modal.style.display = 'none';
            document.body.style.overflow = '';
            document.removeEventListener('keydown', handleEsc);
        };
        
        modal.querySelector('.close-btn').onclick = closeModal;
        
        // ESC键关闭
        const handleEsc = (e) => {
            if (e.key === 'Escape') {
                closeModal();
            }
        };
        document.addEventListener('keydown', handleEsc);
        
        // 点击模态框外部关闭
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal();
            }
        });
    }

    copyToClipboard(text) {
        navigator.clipboard.writeText(text).catch(err => {
            console.error('复制失败:', err);
            // 降级方案
            const textarea = document.createElement('textarea');
            textarea.value = text;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
        });
    }

    downloadFile(url, filename) {
        // 如果是模拟数据，直接在新窗口打开
        if (url.startsWith('https://picsum.photos')) {
            window.open(url, '_blank');
            return;
        }
        
        // 实际文件下载
        const a = document.createElement('a');
        a.href = url;
        a.download = filename || 'download';
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    deleteFile(fileId) {
        try {
            // 模拟API删除请求
            // await fetch(`/api/files/${fileId}`, { method: 'DELETE' });
            
            // 从本地列表中删除
            this.files = this.files.filter(file => file.id != fileId);
            this.filteredFiles = this.filteredFiles.filter(file => file.id != fileId);
            
            this.totalPages = Math.ceil(this.filteredFiles.length / 8);
            if (this.currentPage > this.totalPages && this.totalPages > 0) {
                this.currentPage = this.totalPages;
            }
            
            this.updatePagination();
            this.renderFileList();
            this.previewModal.style.display = 'none';
            document.body.style.overflow = '';
            
            this.showToast('文件已删除', 'success');
        } catch (error) {
            console.error('删除文件失败:', error);
            this.showToast('删除文件失败', 'error');
        }
    }

    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <i class="fas ${this.getToastIcon(type)}"></i>
            <span>${message}</span>
        `;
        
        this.toastContainer.appendChild(toast);
        
        // 自动消失
        setTimeout(() => {
            toast.style.animation = 'fadeOut 0.3s ease';
            toast.addEventListener('animationend', () => {
                toast.remove();
            });
        }, 3000);
    }

    getToastIcon(type) {
        const icons = {
            success: 'fa-check-circle',
            error: 'fa-exclamation-circle',
            warning: 'fa-exclamation-triangle',
            info: 'fa-info-circle'
        };
        return icons[type] || 'fa-info-circle';
    }

    formatFileSize(bytes) {
        if (typeof bytes === 'string') return bytes;
        if (typeof bytes !== 'number') return '0B';
        if (bytes < 1024) return bytes + 'B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB';
        if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
        return (bytes / (1024 * 1024 * 1024)).toFixed(1) + 'GB';
    }

    getRandomDimensions() {
        const widths = [800, 1024, 1280, 1920, 2560];
        const heights = [600, 768, 720, 1080, 1440];
        const i = Math.floor(Math.random() * widths.length);
        return `${widths[i]}x${heights[i]}`;
    }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
    new ImageUploader();
});