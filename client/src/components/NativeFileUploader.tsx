import { useState, useRef, useCallback } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { X, FileText, CheckCircle2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import ExifReader from "exifreader";

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  file: File;
  objectPath?: string;
  takenAt?: Date;
  relativePath?: string;
  status: 'pending' | 'uploading' | 'success' | 'error';
  progress: number;
  error?: string;
}

interface NativeFileUploaderProps {
  maxNumberOfFiles?: number;
  maxFileSize?: number;
  accept?: string;
  allowFolders?: boolean;
  onUploadComplete?: (files: Array<{ name: string; objectPath: string; size: number; type: string; takenAt?: Date; relativePath?: string }>) => void;
  buttonClassName?: string;
  children: ReactNode;
}

async function extractExifDate(file: File): Promise<Date | undefined> {
  if (!file.type.startsWith('image/')) return undefined;
  
  try {
    const arrayBuffer = await file.arrayBuffer();
    const tags = ExifReader.load(arrayBuffer);
    
    // Helper function to parse EXIF date tag
    const parseExifDateTag = (tag: any): Date | undefined => {
      if (!tag) return undefined;
      
      // If value is already a Date object
      if (tag.value instanceof Date && !isNaN(tag.value.getTime())) {
        return tag.value;
      }
      
      // If value is an array (some ExifReader versions return this)
      if (Array.isArray(tag.value) && tag.value.length >= 1) {
        const valStr = String(tag.value[0]);
        if (valStr.includes(':')) {
          const [datePart, timePart] = valStr.split(' ');
          if (datePart && timePart) {
            const [year, month, day] = datePart.split(':');
            const isoDate = `${year}-${month}-${day}T${timePart}`;
            const date = new Date(isoDate);
            if (!isNaN(date.getTime())) return date;
          }
        }
      }
      
      // Parse description string (format: "2023:05:20 17:02:00")
      if (tag.description && typeof tag.description === 'string') {
        const dateStr = tag.description;
        const [datePart, timePart] = dateStr.split(' ');
        if (datePart && timePart) {
          const [year, month, day] = datePart.split(':');
          const isoDate = `${year}-${month}-${day}T${timePart}`;
          const date = new Date(isoDate);
          if (!isNaN(date.getTime())) return date;
        }
      }
      
      return undefined;
    };
    
    // Try DateTimeOriginal first (when photo was actually taken)
    const dateFromOriginal = parseExifDateTag(tags['DateTimeOriginal']);
    if (dateFromOriginal) return dateFromOriginal;
    
    // Try CreateDate as fallback
    const dateFromCreate = parseExifDateTag(tags['CreateDate']);
    if (dateFromCreate) return dateFromCreate;
    
    // Try DateTime as last resort
    const dateFromDateTime = parseExifDateTag(tags['DateTime']);
    if (dateFromDateTime) return dateFromDateTime;
  } catch (error) {
    // Silently fail if EXIF extraction fails
  }
  
  return undefined;
}

export function NativeFileUploader({
  maxNumberOfFiles = 1,
  maxFileSize = 10485760,
  accept,
  allowFolders = false,
  onUploadComplete,
  buttonClassName,
  children,
}: NativeFileUploaderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Handler to click folder input and ensure webkitdirectory is set
  const handleFolderInputClick = useCallback(() => {
    if (folderInputRef.current) {
      // Ensure webkitdirectory is set - React doesn't handle it well through JSX
      folderInputRef.current.setAttribute('webkitdirectory', '');
      folderInputRef.current.setAttribute('directory', '');
      folderInputRef.current.click();
    }
  }, []);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    
    const validFiles = selectedFiles
      .filter(file => file.size <= maxFileSize)
      .slice(0, maxNumberOfFiles - files.length);
    
    const newFiles: UploadedFile[] = await Promise.all(
      validFiles.map(async file => {
        const takenAt = await extractExifDate(file);
        // Extract relative path from webkitRelativePath (folder path without filename)
        const webkitPath = (file as any).webkitRelativePath || '';
        const pathParts = webkitPath.split('/');
        // Remove filename from path, keep folder structure
        const relativePath = pathParts.length > 1 ? pathParts.slice(0, -1).join('/') : '';
        
        return {
          id: Math.random().toString(36).substring(7),
          name: file.name,
          size: file.size,
          type: file.type || 'application/octet-stream',
          file,
          takenAt,
          relativePath: relativePath || undefined,
          status: 'pending' as const,
          progress: 0,
        };
      })
    );

    setFiles(prev => [...prev, ...newFiles].slice(0, maxNumberOfFiles));
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    if (folderInputRef.current) {
      folderInputRef.current.value = '';
    }
  };

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const uploadFiles = useCallback(async () => {
    if (files.length === 0) return;

    setIsUploading(true);
    const uploadedFiles: Array<{ name: string; objectPath: string; size: number; type: string; takenAt?: Date; relativePath?: string }> = [];

    for (const uploadFile of files) {
      if (uploadFile.status === 'success') {
        if (uploadFile.objectPath) {
          uploadedFiles.push({
            name: uploadFile.name,
            objectPath: uploadFile.objectPath,
            size: uploadFile.size,
            type: uploadFile.type,
            takenAt: uploadFile.takenAt,
            relativePath: uploadFile.relativePath,
          });
        }
        continue;
      }

      setFiles(prev => prev.map(f => 
        f.id === uploadFile.id ? { ...f, status: 'uploading' as const, progress: 10 } : f
      ));

      try {
        const res = await fetch("/api/uploads/request-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: uploadFile.name,
            size: uploadFile.size,
            contentType: uploadFile.type,
          }),
        });

        if (!res.ok) {
          throw new Error("Failed to get upload URL");
        }

        const { uploadURL, objectPath } = await res.json();

        setFiles(prev => prev.map(f => 
          f.id === uploadFile.id ? { ...f, progress: 30 } : f
        ));

        const uploadRes = await fetch(uploadURL, {
          method: "PUT",
          body: uploadFile.file,
          headers: {
            "Content-Type": uploadFile.type,
          },
        });

        if (!uploadRes.ok) {
          throw new Error("Failed to upload file");
        }

        setFiles(prev => prev.map(f => 
          f.id === uploadFile.id ? { ...f, status: 'success' as const, progress: 100, objectPath } : f
        ));

        uploadedFiles.push({
          name: uploadFile.name,
          objectPath,
          size: uploadFile.size,
          type: uploadFile.type,
          takenAt: uploadFile.takenAt,
          relativePath: uploadFile.relativePath,
        });
      } catch (error) {
        setFiles(prev => prev.map(f => 
          f.id === uploadFile.id ? { 
            ...f, 
            status: 'error' as const, 
            error: error instanceof Error ? error.message : 'Upload failed' 
          } : f
        ));
      }
    }

    setIsUploading(false);

    if (uploadedFiles.length > 0) {
      onUploadComplete?.(uploadedFiles);
    }
  }, [files, onUploadComplete]);

  const handleClose = () => {
    if (!isUploading) {
      setIsOpen(false);
      setFiles([]);
    }
  };

  const allUploaded = files.length > 0 && files.every(f => f.status === 'success');
  const hasErrors = files.some(f => f.status === 'error');
  const pendingCount = files.filter(f => f.status === 'pending').length;

  return (
    <>
      <Button 
        onClick={() => setIsOpen(true)} 
        className={buttonClassName} 
        data-testid="button-upload-files"
      >
        {children}
      </Button>

      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Files</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex gap-2">
              <div 
                className="flex-1 border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover-elevate transition-colors"
                onClick={() => fileInputRef.current?.click()}
                data-testid="upload-drop-zone"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple={maxNumberOfFiles > 1}
                  accept={accept}
                  onChange={handleFileSelect}
                  className="hidden"
                  data-testid="input-file-native"
                />
                <p className="text-sm text-muted-foreground">
                  Click to select files
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Max {maxNumberOfFiles} file{maxNumberOfFiles > 1 ? 's' : ''}, up to {formatFileSize(maxFileSize)} each
                </p>
              </div>
              {allowFolders && (
                <div 
                  className="flex-1 border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover-elevate transition-colors"
                  onClick={handleFolderInputClick}
                  data-testid="upload-folder-zone"
                >
                  <input
                    ref={folderInputRef}
                    type="file"
                    onChange={handleFileSelect}
                    className="hidden"
                    data-testid="input-folder-native"
                  />
                  <p className="text-sm text-muted-foreground">
                    Click to select folder
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Preserves folder structure
                  </p>
                </div>
              )}
            </div>

            {files.length > 0 && (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {files.map(file => (
                  <div 
                    key={file.id} 
                    className="flex items-center gap-2 p-2 rounded bg-muted/50"
                    data-testid={`file-item-${file.id}`}
                  >
                    <FileText className="w-4 h-4 shrink-0 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{file.name}</p>
                      <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
                      {file.status === 'uploading' && (
                        <Progress value={file.progress} className="h-1 mt-1" />
                      )}
                      {file.status === 'error' && (
                        <p className="text-xs text-destructive">{file.error}</p>
                      )}
                    </div>
                    {file.status === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                    ) : file.status !== 'uploading' && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 shrink-0"
                        onClick={() => removeFile(file.id)}
                        data-testid={`button-remove-file-${file.id}`}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={handleClose}
                disabled={isUploading}
                data-testid="button-cancel-upload"
              >
                {allUploaded ? 'Done' : 'Cancel'}
              </Button>
              {!allUploaded && (
                <Button
                  onClick={uploadFiles}
                  disabled={isUploading || files.length === 0 || (allUploaded && !hasErrors)}
                  data-testid="button-start-upload"
                >
                  {isUploading 
                    ? 'Uploading...' 
                    : hasErrors 
                      ? 'Retry Failed' 
                      : `Upload ${pendingCount} File${pendingCount !== 1 ? 's' : ''}`}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
