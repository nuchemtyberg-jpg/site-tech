import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { format } from "date-fns";
import { CheckSquare, ChevronLeft, ChevronRight, Download, File, FileText, Folder, FolderInput, FolderPlus, History, Home, Image as ImageIcon, Info, LayoutGrid, List, MoreVertical, Pencil, Play, Search, Share2, Square, Star, Tags, Trash2, Upload, Video, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { TagInput } from "@/components/TagInput";
import { NativeFileUploader as BaseFileUploader } from "@/components/NativeFileUploader";
import { cn, getProxyUrl, getProxyUrlWithFilename } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import type { FileWithUploader, Folder as DocumentFolder } from "@shared/schema";
import { documentToolsBase, groupDocuments, useDocumentTools, type DocumentEntity } from "./use-document-tools";
import { createRegistrationSession, readDroppedFiles, uploadDroppedFile, type DroppedFile } from "./document-uploads";

type DeleteTarget = { kind: "file"; file: FileWithUploader; scope: "version" | "document" } | { kind: "folder"; folder: DocumentFolder } | { kind: "batch" };
// Only this tool has a registration session that safely handles each file.
const NativeFileUploader = (props: React.ComponentProps<typeof BaseFileUploader>) =>
  <BaseFileUploader {...props} registrationMode="per-file" />;
type EditTarget = { kind: "file"; file: FileWithUploader } | { kind: "folder"; folder: DocumentFolder } | { kind: "create" } | { kind: "tags"; file: FileWithUploader };
const sizeLabel = (size: number | null) => size == null ? "—" : size < 1024 ? `${size} B` : size < 1048576 ? `${(size / 1024).toFixed(1)} KB` : `${(size / 1048576).toFixed(1)} MB`;
const dateLabel = (date: string | Date | null) => date ? format(new Date(date), "MMM d, yyyy h:mm a") : "Unknown date";

/** The Project file manager, scoped to either document owner. */
export function DocumentsTool({ entityType, entityId }: { entityType: DocumentEntity; entityId: number }) {
  // Keying the inner tool prevents selections, dialogs and upload sessions leaking
  // when routing between two owners that happen to have the same numeric ID.
  return <DocumentsManager key={`${entityType}:${entityId}`} entityType={entityType} entityId={entityId} />;
}

function DocumentsManager({ entityType, entityId }: { entityType: DocumentEntity; entityId: number }) {
  const tools = useDocumentTools(entityType, entityId);
  const { toast } = useToast();
  const folders = tools.folders.data ?? [];
  const groups = useMemo(() => groupDocuments((tools.files.data ?? []).filter(file => !file.albumId)), [tools.files.data]);
  const currentFiles = groups.map(group => group.current);
  const search = useSearch();
  const [location, navigate] = useLocation();
  const [currentFolderId, setCurrentFolderId] = useState<number | null>(() => {
    const raw = new URLSearchParams(window.location.search).get("folder");
    const id = Number(raw);
    return raw && Number.isInteger(id) && id > 0 ? id : null;
  });
  const [query, setQuery] = useState("");
  const [starred, setStarred] = useState(false);
  const [view, setView] = useState<"list" | "grid">("list");
  const [selectMode, setSelectMode] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<Set<number>>(new Set());
  const [selectedFolders, setSelectedFolders] = useState<Set<number>>(new Set());
  const [edit, setEdit] = useState<EditTarget | null>(null);
  const [name, setName] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [remove, setRemove] = useState<DeleteTarget | null>(null);
  const [detailsId, setDetailsId] = useState<number | null>(null);
  const [historyId, setHistoryId] = useState<number | null>(null);
  const [version, setVersion] = useState<FileWithUploader | null>(null);
  const [preview, setPreview] = useState<FileWithUploader | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveFolderId, setMoveFolderId] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [dropProgress, setDropProgress] = useState<{ current: number; total: number } | null>(null);
  const [failedDrop, setFailedDrop] = useState<DroppedFile[]>([]);
  const [failedDropFolders, setFailedDropFolders] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const dragDepth = useRef(0);
  const dropLock = useRef(false);
  const readingDrop = useRef(false);
  const actionLock = useRef(false);
  const toolsRef = useRef(tools);
  toolsRef.current = tools;
  const foldersRef = useRef(folders);
  foldersRef.current = folders;
  const normalSession = useRef<ReturnType<typeof createRegistrationSession> | null>(null);
  const dropSession = useRef<ReturnType<typeof createRegistrationSession> | null>(null);
  const versionSession = useRef<ReturnType<typeof createRegistrationSession> | null>(null);
  const base = documentToolsBase(entityType, entityId);
  useEffect(() => {
    const raw = new URLSearchParams(search).get("folder");
    const value = Number(raw);
    setCurrentFolderId(raw && Number.isInteger(value) && value > 0 ? value : null);
    setSelectedFiles(new Set()); setSelectedFolders(new Set());
  }, [search]);

  const session = (folderId: number | null, supersedesId?: number) => createRegistrationSession({
    base, folderId, supersedesId,
    getFolders: () => foldersRef.current,
    createFolder: data => toolsRef.current.createFolder.mutateAsync(data),
    createFile: data => toolsRef.current.createFile.mutateAsync(data),
  });
  function crumbs(id: number | null) {
    const path: { id: number | null; name: string }[] = [];
    const visited = new Set<number>();
    let folder = folders.find(f => f.id === id);
    while (folder && !visited.has(folder.id)) {
      visited.add(folder.id);
      path.unshift({ id: folder.id, name: folder.name });
      folder = folders.find(f => f.id === folder!.parentId);
    }
    return [{ id: null, name: "Documents" }, ...path];
  }
  function navigateFolder(id: number | null) {
    setCurrentFolderId(id);
    setSelectedFiles(new Set()); setSelectedFolders(new Set());
    const params = new URLSearchParams(search);
    id === null ? params.delete("folder") : params.set("folder", String(id));
    navigate(`${location.split("?")[0]}${params.size ? `?${params.toString()}` : ""}`);
  }
  const matches = (value: string) => value.toLowerCase().includes(query.trim().toLowerCase());
  const visibleFiles = currentFiles.filter(file => (starred ? file.starred : file.folderId === currentFolderId) && (matches(file.name) || file.tags?.some(matches))).sort((a, b) => a.id - b.id);
  const visibleFolders = starred ? [] : folders.filter(folder => folder.parentId === currentFolderId && matches(folder.name));
  const selectedCount = selectedFiles.size + selectedFolders.size;
  const details = currentFiles.find(file => file.id === detailsId);
  const history = groups.find(group => group.groupId === historyId);
  const loading = tools.files.isLoading || tools.folders.isLoading;
  const error = tools.files.isError || tools.folders.isError;
  const toggle = (id: number, kind: "file" | "folder") => {
    const setter = kind === "file" ? setSelectedFiles : setSelectedFolders;
    setter(previous => { const next = new Set(previous); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };
  function openEdit(target: EditTarget) {
    setEdit(target);
    setName(target.kind === "create" ? "" : target.kind === "folder" ? target.folder.name : target.file.name);
    setTags(target.kind === "tags" ? target.file.tags ?? [] : []);
  }
  async function action(work: () => Promise<unknown>, complete?: () => void) {
    if (actionLock.current) return;
    actionLock.current = true; setSaving(true);
    try { await work(); complete?.(); }
    catch (error) { toast({ title: "Couldn't update documents", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" }); }
    finally { actionLock.current = false; setSaving(false); }
  }
  function startVersion(file: FileWithUploader) {
    versionSession.current = session(file.folderId, file.id);
    setVersion(file);
  }
  async function runDrop(files: DroppedFile[], paths: string[]) {
    if (dropLock.current) return;
    dropLock.current = true;
    const registration = dropSession.current!;
    const failures: DroppedFile[] = [];
    const folderFailures: string[] = [];
    let completed = 0;
    const total = files.length + paths.length;
    setDropProgress({ current: 0, total });
    try {
      for (const path of paths) {
        try { await registration.ensureFolder(path); } catch { folderFailures.push(path); }
        setDropProgress({ current: ++completed, total });
      }
      for (const item of files) {
        try {
          if (item.file.size > 52428800) throw new Error("Files must be 50 MB or smaller.");
          await registration.register([await uploadDroppedFile(item)]);
        } catch { failures.push(item); }
        setDropProgress({ current: ++completed, total });
      }
      setFailedDrop(failures); setFailedDropFolders(folderFailures);
      toast({ title: failures.length || folderFailures.length ? "Some uploads failed" : "Upload complete", description: failures.length || folderFailures.length ? "Retry failed items below. Successful files will not be uploaded again." : `${files.length} file(s) registered.`, variant: failures.length || folderFailures.length ? "destructive" : "default" });
    } finally { setDropProgress(null); dropLock.current = false; }
  }
  async function drop(event: React.DragEvent) {
    event.preventDefault(); dragDepth.current = 0; setDragOver(false);
    if (dropLock.current || readingDrop.current || failedDrop.length || failedDropFolders.length) return;
    readingDrop.current = true;
    // Capture entries synchronously before the DataTransfer store is cleared.
    const pending = readDroppedFiles(event.dataTransfer);
    dropSession.current = session(currentFolderId);
    try {
      const data = await pending;
      const valid = data.files.filter(item => item.file.size <= 52428800);
      const skipped = data.files.length - valid.length;
      if (skipped) toast({ title: "Some files skipped", description: `${skipped} file(s) exceeded the 50MB limit.`, variant: "destructive" });
      if (valid.length || data.folders.length) await runDrop(valid, data.folders);
    }
    catch (error) { toast({ title: "Couldn't read dropped files", description: String(error), variant: "destructive" }); }
    finally { readingDrop.current = false; }
  }
  const previewFile = (file: FileWithUploader) => file.contentType === "application/pdf" ? window.open(getProxyUrlWithFilename(file.objectPath, file.name), "_blank", "noopener") : setPreview(file);
  async function shareFile(file: FileWithUploader) {
    const url = `${window.location.origin}${getProxyUrl(file.objectPath)}`;
    try {
      const response = await fetch(getProxyUrl(file.objectPath), { credentials: "include" });
      if (!response.ok) throw new Error("Unable to read file");
      const blob = await response.blob();
      const attachment = new window.File([blob], file.name, { type: file.contentType || "application/octet-stream" });
      if (navigator.canShare?.({ files: [attachment] })) await navigator.share({ files: [attachment], title: file.name });
      else if (navigator.share) await navigator.share({ title: file.name, url });
      else { await navigator.clipboard.writeText(url); toast({ title: "Link Copied", description: "File link copied to clipboard." }); }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      try { await navigator.clipboard.writeText(url); toast({ title: "Link Copied" }); }
      catch { toast({ title: "Share Failed", variant: "destructive" }); }
    }
  }
  const download = (file: FileWithUploader) => getProxyUrlWithFilename(file.objectPath, file.name, true);
  const fileIcon = (file: FileWithUploader) => file.contentType?.startsWith("image/") ? <ImageIcon className="w-5 h-5 text-green-500" /> : file.contentType?.startsWith("video/") ? <Video className="w-5 h-5 text-blue-500" /> : file.contentType === "application/pdf" ? <FileText className="w-5 h-5 text-red-500" /> : <File className="w-5 h-5 text-muted-foreground" />;
  function thumbnail(file: FileWithUploader) {
    if (file.contentType?.startsWith("image/")) return <img src={getProxyUrl(file.objectPath)} alt={file.name} loading="lazy" className="w-full h-full object-cover" />;
    return <div className={cn("w-full h-full flex flex-col items-center justify-center", file.contentType === "application/pdf" ? "bg-red-500/10" : "bg-muted/50")}>{file.contentType?.startsWith("video/") ? <Play className="w-10 h-10 text-blue-500" /> : file.contentType === "application/pdf" ? <FileText className="w-10 h-10 text-red-500" /> : <File className="w-10 h-10 text-muted-foreground" />}<span className="text-xs uppercase mt-1">{file.name.split(".").pop()}</span></div>;
  }
  function openMove(file?: FileWithUploader, folder?: DocumentFolder) {
    if (file || folder) { setSelectedFiles(new Set(file ? [file.id] : [])); setSelectedFolders(new Set(folder ? [folder.id] : [])); }
    setMoveFolderId(null); setMoveOpen(true);
  }
  function cycle(id: number | null) {
    const seen = new Set<number>();
    while (id !== null && !seen.has(id)) {
      if (selectedFolders.has(id)) return true;
      seen.add(id); id = folders.find(folder => folder.id === id)?.parentId ?? null;
    }
    return false;
  }
  const clearSelection = () => { setSelectedFiles(new Set()); setSelectedFolders(new Set()); setSelectMode(false); };
  const desktopActions = (file: FileWithUploader) => <div className="hidden sm:flex gap-1">
    <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 focus:opacity-100 h-8 w-8" aria-label={`Details for ${file.name}`} onClick={() => setDetailsId(file.id)} data-testid={`button-info-file-${file.id}`}><Info className="w-4 h-4" /></Button>
    <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 focus:opacity-100 h-8 w-8" aria-label={`Rename ${file.name}`} onClick={() => openEdit({ kind: "file", file })} data-testid={`button-rename-file-${file.id}`}><Pencil className="w-4 h-4" /></Button>
    <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 focus:opacity-100 h-8 w-8" aria-label={`Edit tags for ${file.name}`} onClick={() => openEdit({ kind: "tags", file })} data-testid={`button-edit-file-${file.id}`}><Tags className="w-4 h-4" /></Button>
    <Button asChild variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 focus:opacity-100 h-8 w-8"><a href={download(file)} download={file.name} aria-label={`Download ${file.name}`} data-testid={`button-download-file-${file.id}`}><Download className="w-4 h-4" /></a></Button>
    <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 focus:opacity-100 h-8 w-8" aria-label={`Delete ${file.name}`} onClick={() => setRemove({ kind: "file", file, scope: "document" })} data-testid={`button-delete-file-${file.id}`}><Trash2 className="w-4 h-4" /></Button>
  </div>;
  const menu = (file: FileWithUploader) => <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-11 w-11 sm:h-8 sm:w-8" aria-label={`Actions for ${file.name}`} data-testid={`button-file-menu-${file.id}`}><MoreVertical className="w-4 h-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end">
    <DropdownMenuItem onClick={() => startVersion(file)}><Upload className="w-4 h-4 mr-2" />New version</DropdownMenuItem>
    <DropdownMenuItem onClick={() => setHistoryId(file.documentGroupId ?? file.id)}><History className="w-4 h-4 mr-2" />Version history</DropdownMenuItem>
    <DropdownMenuItem onClick={() => setDetailsId(file.id)}><Info className="w-4 h-4 mr-2" />Details</DropdownMenuItem>
    <DropdownMenuItem onClick={() => openEdit({ kind: "file", file })}><Pencil className="w-4 h-4 mr-2" />Rename</DropdownMenuItem>
    <DropdownMenuItem onClick={() => openEdit({ kind: "tags", file })}><Tags className="w-4 h-4 mr-2" />Edit tags</DropdownMenuItem>
    <DropdownMenuItem onClick={() => openMove(file)}><FolderInput className="w-4 h-4 mr-2" />Move</DropdownMenuItem>
    <DropdownMenuItem onClick={() => shareFile(file)}><Share2 className="w-4 h-4 mr-2" />Share</DropdownMenuItem>
    <DropdownMenuItem asChild><a href={download(file)} download={file.name}><Download className="w-4 h-4 mr-2" />Download</a></DropdownMenuItem>
    <DropdownMenuItem onClick={() => setRemove({ kind: "file", file, scope: "version" })}>Delete current version</DropdownMenuItem>
    <DropdownMenuItem className="text-destructive" onClick={() => setRemove({ kind: "file", file, scope: "document" })}><Trash2 className="w-4 h-4 mr-2" />Delete document with history</DropdownMenuItem>
  </DropdownMenuContent></DropdownMenu>;
  const dateGroups = visibleFiles.reduce<Record<string, FileWithUploader[]>>((result, file) => {
    const date = file.createdAt ? format(new Date(file.createdAt), "MMMM d, yyyy") : "Unknown date";
    (result[date] ??= []).push(file); return result;
  }, {});

  return <div className="flex flex-col min-h-[420px] h-[calc(100dvh-180px)] overflow-hidden" data-testid="documents-tool" data-entity-type={entityType}>
    <div className={cn("relative rounded-lg flex flex-col h-full", dragOver && "ring-2 ring-primary ring-offset-2 bg-primary/5")}
      onDragEnter={event => { event.preventDefault(); if (event.dataTransfer.types.includes("Files")) { dragDepth.current++; setDragOver(true); } }}
      onDragOver={event => event.preventDefault()}
      onDragLeave={event => { event.preventDefault(); dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragOver(false); }}
      onDrop={drop}>
      {dragOver && <div className="absolute inset-0 z-50 flex items-center justify-center bg-primary/10 backdrop-blur-sm rounded-lg border-2 border-dashed border-primary pointer-events-none"><div className="text-center"><Upload className="w-12 h-12 mx-auto text-primary mb-2" /><p className="text-lg font-medium text-primary">Drop files here to upload</p><p className="text-sm text-muted-foreground">Files will be uploaded to the current folder</p></div></div>}
      {dropProgress && <div className="mb-3 p-4 bg-muted rounded-lg" role="status"><p className="text-sm">Uploading item {dropProgress.current} of {dropProgress.total}...</p><div className="h-1 bg-primary/20 mt-2 rounded"><div className="h-full bg-primary rounded" style={{ width: `${dropProgress.total ? dropProgress.current / dropProgress.total * 100 : 0}%` }} /></div></div>}
      {(failedDrop.length > 0 || failedDropFolders.length > 0) && <div className="mb-3 p-3 border border-destructive/30 rounded-lg text-sm" role="alert"><p>{failedDrop.length} file(s) and {failedDropFolders.length} folder(s) failed.</p><p className="text-muted-foreground break-words">{failedDrop.map(item => item.file.name).join(", ")}</p><div className="flex gap-2 mt-2"><Button variant="outline" disabled={!!dropProgress} onClick={() => runDrop(failedDrop, failedDropFolders)}>Retry failed items</Button><Button variant="ghost" disabled={!!dropProgress} onClick={() => { setFailedDrop([]); setFailedDropFolders([]); }}>Dismiss</Button></div></div>}
      <div className="sticky top-0 z-20 bg-background pb-3 space-y-3">
        <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input placeholder="Search files and folders..." aria-label="Search files and folders" value={query} onChange={event => setQuery(event.target.value)} className="pl-10 bg-white dark:bg-zinc-900 h-11 sm:h-9" data-testid="input-doc-search" />{query && <Button size="icon" variant="ghost" className="absolute right-0 top-0 h-11 sm:h-9" aria-label="Clear search" onClick={() => setQuery("")}><X className="w-4 h-4" /></Button>}</div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <div className="flex items-center gap-0.5 bg-muted rounded-lg p-0.5">
              <Button variant={view === "grid" ? "default" : "ghost"} size="icon" className="h-11 w-11 sm:h-9 sm:w-9" aria-label="Grid view" onClick={() => setView("grid")} data-testid="button-view-grid"><LayoutGrid className="w-4 h-4" /></Button>
              <Button variant={view === "list" ? "default" : "ghost"} size="icon" className="h-11 w-11 sm:h-9 sm:w-9" aria-label="List view" onClick={() => setView("list")} data-testid="button-view-list"><List className="w-4 h-4" /></Button>
            </div>
            <Button variant={starred ? "default" : "outline"} className="h-11 w-11 p-0 sm:h-9 sm:w-auto sm:px-4 inline-flex items-center justify-center gap-2" aria-label={starred ? "Show all files" : "Show starred files"} onClick={() => { setStarred(!starred); if (!starred) navigateFolder(null); }} data-testid="button-toggle-starred"><Star className={cn("w-4 h-4 shrink-0", starred && "fill-current")} /><span className="hidden sm:inline">Starred</span>{currentFiles.some(file => file.starred) && <Badge variant="secondary" className="hidden sm:inline-flex text-xs">{currentFiles.filter(file => file.starred).length}</Badge>}</Button>
            <Button variant={selectMode ? "default" : "outline"} className="h-11 w-11 p-0 sm:h-9 sm:w-auto sm:px-4 inline-flex items-center justify-center gap-2" aria-label={selectMode ? "Cancel selection" : "Select items"} onClick={() => selectMode ? clearSelection() : setSelectMode(true)} data-testid="button-toggle-select-mode"><CheckSquare className="w-4 h-4 shrink-0" /><span className="hidden sm:inline">{selectMode ? "Cancel" : "Select"}</span></Button>
          </div>
          {selectMode ? <div className="flex items-center gap-2 flex-wrap"><span className="text-sm text-muted-foreground">{selectedCount} selected</span><Button variant="outline" onClick={() => { setSelectedFiles(new Set(visibleFiles.map(file => file.id))); setSelectedFolders(new Set(visibleFolders.map(folder => folder.id))); }}>Select all</Button><Button variant="outline" disabled={!selectedCount} onClick={() => openMove()}><FolderInput className="w-4 h-4 mr-2" />Move</Button><Button variant="outline" disabled={!selectedCount} onClick={() => setRemove({ kind: "batch" })}><Trash2 className="w-4 h-4 mr-2" />Delete</Button></div> : <div className="flex gap-2">
            <Button variant="outline" className="h-11 w-11 p-0 sm:h-9 sm:w-auto sm:px-4" aria-label="New Folder" onClick={() => openEdit({ kind: "create" })} data-testid="button-new-folder"><FolderPlus className="w-4 h-4 shrink-0 sm:mr-2" /><span className="hidden sm:inline">New Folder</span></Button>
            <div onClickCapture={event => { if ((event.target as HTMLElement).closest('[data-testid="button-upload-files"]')) normalSession.current = session(currentFolderId); }}>
              <NativeFileUploader maxNumberOfFiles={50} maxFileSize={52428800} allowFolders uploadTarget="object-storage" buttonVariant="outline" buttonClassName="h-11 w-11 p-0 sm:h-9 sm:w-auto sm:px-4 inline-flex items-center justify-center gap-2" onUploadComplete={async files => { await (normalSession.current ??= session(currentFolderId)).register(files); }}><Upload className="w-4 h-4 shrink-0" /><span className="hidden sm:inline">Upload</span><span className="sr-only sm:hidden">Upload</span></NativeFileUploader>
            </div>
          </div>}
        </div>
        <div className="flex items-center gap-1 text-sm text-muted-foreground flex-wrap">{crumbs(currentFolderId).map((crumb, index) => <div key={crumb.id ?? "root"} className="flex items-center gap-1"><button className={cn("hover:text-primary min-h-9 px-1", index === crumbs(currentFolderId).length - 1 && "text-foreground font-medium")} aria-label={crumb.name} onClick={() => navigateFolder(crumb.id)} data-testid={`breadcrumb-${crumb.id ?? "root"}`}>{index === 0 ? <Home className="w-4 h-4" /> : crumb.name}</button>{index < crumbs(currentFolderId).length - 1 && <ChevronRight className="w-4 h-4" />}</div>)}</div>
      </div>
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {loading ? <div className="space-y-3 py-3" aria-label="Loading documents">{[1, 2, 3, 4].map(id => <div key={id} className="h-16 bg-muted/60 rounded-lg animate-pulse" />)}</div> : error ? <div className="py-16 text-center border border-dashed rounded-xl"><FileText className="w-10 h-10 mx-auto mb-3 text-muted-foreground" /><p>Couldn't load documents.</p><Button variant="outline" className="mt-3" onClick={() => { tools.files.refetch(); tools.folders.refetch(); }}>Retry</Button></div> : !visibleFiles.length && !visibleFolders.length ? <div className="py-20 text-center bg-card border border-dashed border-border rounded-xl"><FileText className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" /><p className="text-muted-foreground">{query ? "No matching files or folders found." : starred ? "No starred files yet. Star files to access them quickly." : "No documents yet. Upload files or create folders to organize your documents."}</p></div> : <div className="space-y-4 w-full max-w-full overflow-hidden">
          {!!visibleFolders.length && <div className="grid gap-2">{visibleFolders.map(folder => <div key={folder.id} className={cn("group bg-card border rounded-lg p-3 hover:border-primary/50 flex items-center justify-between", selectedFolders.has(folder.id) ? "border-primary ring-2 ring-primary/30" : "border-border")} data-testid={`folder-item-${folder.id}`}>
            {selectMode && <button className="shrink-0 mr-3 min-h-11" aria-label={`Select folder ${folder.name}`} onClick={() => toggle(folder.id, "folder")} data-testid={`checkbox-folder-${folder.id}`}>{selectedFolders.has(folder.id) ? <CheckSquare className="w-5 h-5 text-primary" /> : <Square className="w-5 h-5 text-muted-foreground" />}</button>}
            <button className="flex items-center gap-3 flex-1 min-w-0 text-left hover:text-primary min-h-11 sm:min-h-8" onClick={() => selectMode ? toggle(folder.id, "folder") : navigateFolder(folder.id)} data-testid={`button-open-folder-${folder.id}`}><Folder className="w-5 h-5 text-primary shrink-0" /><span className="font-medium truncate">{folder.name}</span></button>
            {!selectMode && <div className="flex gap-1"><Button variant="ghost" size="icon" className="h-11 w-11 sm:h-8 sm:w-8 sm:opacity-0 group-hover:opacity-100 focus:opacity-100" aria-label={`Rename folder ${folder.name}`} onClick={() => openEdit({ kind: "folder", folder })} data-testid={`button-rename-folder-${folder.id}`}><Pencil className="w-4 h-4" /></Button><Button variant="ghost" size="icon" className="h-11 w-11 sm:h-8 sm:w-8 sm:opacity-0 group-hover:opacity-100 focus:opacity-100" aria-label={`Delete folder ${folder.name}`} onClick={() => setRemove({ kind: "folder", folder })} data-testid={`button-delete-folder-${folder.id}`}><Trash2 className="w-4 h-4" /></Button><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-11 w-11 sm:h-8 sm:w-8" aria-label={`Actions for folder ${folder.name}`}><MoreVertical className="w-4 h-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => openMove(undefined, folder)}><FolderInput className="w-4 h-4 mr-2" />Move</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>}
          </div>)}</div>}
          {view === "grid" ? <div className="space-y-6">{Object.entries(dateGroups).sort(([a], [b]) => new Date(b).getTime() - new Date(a).getTime()).map(([date, files]) => <section key={date} className="space-y-3"><h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{date}</h4><div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">{files.map(file => <div key={file.id} data-testid={`file-item-${file.id}`} className={cn("group relative aspect-square bg-card border rounded-lg overflow-hidden hover:border-primary/50", selectedFiles.has(file.id) ? "border-primary ring-2 ring-primary/30" : "border-border")}>
            <button className="w-full h-full text-left" aria-label={selectMode ? `Select ${file.name}` : `Open ${file.name}`} onClick={() => selectMode ? toggle(file.id, "file") : previewFile(file)}>{thumbnail(file)}<div className="absolute bottom-0 left-0 right-0 bg-black/60 backdrop-blur-sm px-2 py-1"><p className="text-white text-xs truncate">{file.name}</p><p className="text-white/70 text-xs">Version {file.documentVersion || 1}{file.tags?.length ? ` · ${file.tags.length} tags` : ""}</p></div></button>
            <div className="absolute top-1 left-1">{selectMode ? <CheckSquare className={cn("w-5 h-5", selectedFiles.has(file.id) ? "text-primary fill-primary/20" : "text-white")} /> : <button className="p-2 rounded bg-black/50 text-white" aria-label={`Star ${file.name}`} onClick={() => action(() => tools.updateFile.mutateAsync({ id: file.id, starred: !file.starred }))}><Star className={cn("w-4 h-4", file.starred && "fill-current text-yellow-400")} /></button>}</div>
            {!selectMode && <div className="absolute top-1 right-1 bg-card/90 rounded">{menu(file)}</div>}
          </div>)}</div></section>)}</div> : <div className="space-y-2">{visibleFiles.map(file => <div key={file.id} data-testid={`file-item-${file.id}`} className={cn("group bg-card border rounded-lg p-3 hover:border-primary/50 flex items-center gap-3", selectedFiles.has(file.id) ? "border-primary ring-2 ring-primary/30" : "border-border")}>
            {selectMode && <button className="shrink-0 min-h-11" aria-label={`Select ${file.name}`} onClick={() => toggle(file.id, "file")} data-testid={`checkbox-file-${file.id}`}>{selectedFiles.has(file.id) ? <CheckSquare className="w-5 h-5 text-primary" /> : <Square className="w-5 h-5 text-muted-foreground" />}</button>}
            <button className="flex items-center gap-3 flex-1 min-w-0 text-left min-h-11 sm:min-h-8" onClick={() => selectMode ? toggle(file.id, "file") : previewFile(file)}>{fileIcon(file)}<div className="min-w-0"><p className="font-medium truncate text-sm">{file.name}</p><div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mt-1"><span>{sizeLabel(file.size)}</span><span>Version {file.documentVersion || 1}</span><span className="hidden sm:inline">{dateLabel(file.createdAt)}</span>{file.tags?.map(tag => <Badge variant="secondary" key={tag} className="text-[10px]">{tag}</Badge>)}</div></div></button>
            {!selectMode && <><Button variant="ghost" size="icon" className="h-11 w-11 sm:h-8 sm:w-8 shrink-0" aria-label={`Star ${file.name}`} onClick={() => action(() => tools.updateFile.mutateAsync({ id: file.id, starred: !file.starred }))} data-testid={`button-star-file-${file.id}`}><Star className={cn("w-4 h-4", file.starred ? "fill-current text-yellow-500" : "text-muted-foreground")} /></Button>{desktopActions(file)}{menu(file)}</>}
          </div>)}</div>}
        </div>}
      </div>
    </div>

    <Dialog open={!!edit} onOpenChange={open => { if (!open && !saving) setEdit(null); }}><DialogContent><DialogHeader><DialogTitle>{edit?.kind === "create" ? "Create New Folder" : edit?.kind === "folder" ? "Rename Folder" : edit?.kind === "tags" ? "Edit File Tags" : "Rename File"}</DialogTitle><DialogDescription>{edit?.kind === "tags" ? "Tags apply to this document and its version history." : "Keep your documents organized."}</DialogDescription></DialogHeader>{edit?.kind === "tags" ? <TagInput value={tags} onChange={setTags} /> : <div className="space-y-2"><Label htmlFor="document-name">{edit?.kind === "file" ? "File Name" : "Folder Name"}</Label><Input id="document-name" value={name} onChange={event => setName(event.target.value)} data-testid={edit?.kind === "create" ? "input-folder-name" : "input-rename-name"} /></div>}<DialogFooter><Button variant="outline" disabled={saving} onClick={() => setEdit(null)}>Cancel</Button><Button disabled={saving || (edit?.kind !== "tags" && !name.trim())} onClick={() => action(async () => {
      if (!edit) return;
      if (edit.kind === "create") await tools.createFolder.mutateAsync({ name: name.trim(), parentId: currentFolderId });
      else if (edit.kind === "folder") await tools.updateFolder.mutateAsync({ id: edit.folder.id, name: name.trim() });
      else await tools.updateFile.mutateAsync({ id: edit.file.id, ...(edit.kind === "tags" ? { tags: tags.length ? tags : null } : { name: name.trim() }) });
    }, () => setEdit(null))}>{saving ? "Saving..." : edit?.kind === "create" ? "Create Folder" : "Save Changes"}</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={moveOpen} onOpenChange={open => { if (!saving) setMoveOpen(open); }}><DialogContent><DialogHeader><DialogTitle>Move {selectedCount} Item{selectedCount === 1 ? "" : "s"}</DialogTitle><DialogDescription>Navigate to a destination folder and click "Move Here". The complete document history moves with each file.</DialogDescription></DialogHeader>
      <div className="flex flex-wrap gap-1 text-sm">{crumbs(moveFolderId).map(crumb => <Button key={crumb.id ?? "root"} variant="ghost" size="sm" onClick={() => setMoveFolderId(crumb.id)}>{crumb.id === null ? <Home className="w-4 h-4 mr-1" /> : <ChevronRight className="w-4 h-4 mr-1" />}{crumb.name}</Button>)}</div>
      <div className="max-h-64 overflow-y-auto border rounded-lg">{moveFolderId !== null && <Button variant="ghost" className="w-full justify-start min-h-11" onClick={() => setMoveFolderId(folders.find(folder => folder.id === moveFolderId)?.parentId ?? null)}><ChevronLeft className="w-4 h-4 mr-2" />Go up</Button>}{folders.filter(folder => folder.parentId === moveFolderId && !cycle(folder.id)).map(folder => <Button key={folder.id} variant="ghost" className="w-full justify-start min-h-11" onClick={() => setMoveFolderId(folder.id)}><Folder className="w-5 h-5 text-primary mr-2" />{folder.name}<ChevronRight className="w-4 h-4 ml-auto" /></Button>)}{!folders.some(folder => folder.parentId === moveFolderId && !cycle(folder.id)) && <p className="p-6 text-sm text-muted-foreground text-center">No subfolders</p>}</div>
      <DialogFooter><Button variant="outline" disabled={saving} onClick={() => setMoveOpen(false)}>Cancel</Button><Button disabled={saving || cycle(moveFolderId) || !selectedCount} onClick={() => action(() => tools.batch.mutateAsync({ fileIds: Array.from(selectedFiles), folderIds: Array.from(selectedFolders), action: "move", folderId: moveFolderId }), () => { clearSelection(); setMoveOpen(false); })}>{saving ? "Moving..." : `Move Here${moveFolderId === null ? " (Root)" : ""}`}</Button></DialogFooter>
    </DialogContent></Dialog>

    <AlertDialog open={!!remove} onOpenChange={open => { if (!open && !saving) setRemove(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{remove?.kind === "file" && remove.scope === "version" ? "Delete this version?" : remove?.kind === "folder" ? "Delete folder?" : "Delete document with history?"}</AlertDialogTitle><AlertDialogDescription>
      {remove?.kind === "file" ? remove.scope === "version" ? `Delete version ${remove.file.documentVersion || 1} of "${remove.file.name}"? If this is the current version, the newest remaining version becomes current. Other versions are kept.` : `Delete "${remove.file.name}" and all of its versions?` : remove?.kind === "folder" ? `Delete "${remove.folder.name}" and its contents, including all document versions?` : `Delete ${selectedCount} selected items and their complete histories, including documents inside selected folders?`} This action cannot be undone.
    </AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel><AlertDialogAction disabled={saving} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" data-testid="button-confirm-delete-document" onClick={event => { event.preventDefault(); action(async () => {
      if (remove?.kind === "file") await tools.deleteFile.mutateAsync({ id: remove.file.id, scope: remove.scope });
      else if (remove?.kind === "folder") await tools.deleteFolder.mutateAsync(remove.folder.id);
      else if (remove?.kind === "batch") await tools.batch.mutateAsync({ fileIds: Array.from(selectedFiles), folderIds: Array.from(selectedFolders), action: "delete" });
    }, () => { setRemove(null); clearSelection(); }); }}>{saving ? "Deleting..." : "Delete"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>

    <Dialog open={detailsId !== null} onOpenChange={open => !open && setDetailsId(null)}><DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>File Details</DialogTitle><DialogDescription>Organization is shared across every version.</DialogDescription></DialogHeader>{details ? <div className="space-y-4"><div className="h-40 rounded-lg overflow-hidden">{thumbnail(details)}</div><dl className="text-sm space-y-3">{[["Name", details.name], ["Type", details.contentType ?? "Unknown"], ["Size", sizeLabel(details.size)], ["Folder", crumbs(details.folderId).map(crumb => crumb.name).join(" / ")], ["Version", String(details.documentVersion || 1)], ["Uploaded by", details.uploaderName || "Unknown uploader"], ["Uploaded", dateLabel(details.createdAt)]].map(([label, value]) => <div key={label}><dt className="text-muted-foreground text-xs">{label}</dt><dd className="break-words">{value}</dd></div>)}</dl><div className="flex flex-wrap gap-1">{details.tags?.map(tag => <Badge key={tag} variant="secondary">{tag}</Badge>)}</div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => startVersion(details)}>New version</Button><Button variant="outline" onClick={() => { setHistoryId(details.documentGroupId ?? details.id); setDetailsId(null); }}>Version history</Button><a href={download(details)} download={details.name} className="inline-flex items-center min-h-11 px-3 text-sm text-primary"><Download className="w-4 h-4 mr-2" />Download</a></div></div> : <p className="text-sm text-muted-foreground">This document is no longer available.</p>}<DialogFooter><Button onClick={() => setDetailsId(null)}>Close</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={historyId !== null} onOpenChange={open => !open && setHistoryId(null)}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>Version history</DialogTitle><DialogDescription>{history?.current.name || "This document is no longer available."}</DialogDescription></DialogHeader>{history?.versions.map(file => <div key={file.id} className="border rounded-lg p-3 space-y-2" data-testid={`document-version-${file.id}`}><div className="flex items-center gap-2"><p className="font-medium text-sm">Version {file.documentVersion || 1}</p>{file.id === history.current.id && <Badge variant="secondary">Current</Badge>}</div><p className="text-sm break-words">{file.name}</p><p className="text-xs text-muted-foreground">{file.uploaderName || "Unknown uploader"} · {dateLabel(file.createdAt)} · {sizeLabel(file.size)}</p><div className="flex flex-wrap gap-2"><a className="inline-flex items-center min-h-11 text-sm text-primary" href={download(file)} download={file.name} aria-label={`Download version ${file.documentVersion || 1}`}><Download className="w-4 h-4 mr-2" />Download</a><Button variant="ghost" className="min-h-11" onClick={() => previewFile(file)}>Open</Button><Button variant="ghost" className="min-h-11 text-destructive" onClick={() => setRemove({ kind: "file", file, scope: "version" })}>Delete version {file.documentVersion || 1}</Button></div></div>)}<DialogFooter>{history && <Button variant="outline" onClick={() => startVersion(history.current)}>New version</Button>}<Button onClick={() => setHistoryId(null)}>Close</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={!!version} onOpenChange={open => { if (!open) setVersion(null); }}><DialogContent><DialogHeader><DialogTitle>New version</DialogTitle><DialogDescription>Upload a revision of "{version?.name}". The previous version stays in history. Folder, tags and starred state are preserved.</DialogDescription></DialogHeader>{version && <NativeFileUploader key={version.id} maxNumberOfFiles={1} maxFileSize={52428800} uploadTarget="object-storage" onUploadComplete={async files => { await versionSession.current!.register(files); toast({ title: "New version registered" }); }}><Upload className="w-4 h-4 mr-2" />Upload new version</NativeFileUploader>}<DialogFooter><Button variant="outline" onClick={() => setVersion(null)}>Close</Button></DialogFooter></DialogContent></Dialog>

    {preview && (preview.contentType?.startsWith("image/") || preview.contentType?.startsWith("video/")) && <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={preview.name} data-testid={preview.contentType.startsWith("image/") ? "image-viewer-modal" : "video-viewer-modal"} onClick={() => setPreview(null)} onKeyDown={event => { if (event.key === "Escape") setPreview(null); }}>
      <button autoFocus className="absolute top-4 right-4 text-white z-10 min-h-11 min-w-11 flex items-center justify-center" aria-label="Close preview" onClick={() => setPreview(null)}><X className="w-6 h-6" /></button>
      {preview.contentType.startsWith("image/") ? <img src={getProxyUrl(preview.objectPath)} alt={preview.name} className="max-w-full max-h-full object-contain" onClick={event => event.stopPropagation()} /> : <video src={getProxyUrl(preview.objectPath)} controls autoPlay className="max-w-full max-h-full" onClick={event => event.stopPropagation()} />}
    </div>}
    <Dialog open={!!preview && !preview.contentType?.startsWith("image/") && !preview.contentType?.startsWith("video/")} onOpenChange={open => !open && setPreview(null)}><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle className="break-words">{preview?.name}</DialogTitle></DialogHeader><div className="py-8 text-center"><File className="w-16 h-16 text-muted-foreground mx-auto mb-4" /><p className="text-muted-foreground">This file type cannot be previewed.</p></div><DialogFooter>{preview && <><Button variant="outline" onClick={() => shareFile(preview)}><Share2 className="w-4 h-4 mr-2" />Share</Button><Button asChild><a href={download(preview)} download={preview.name}><Download className="w-4 h-4 mr-2" />Download</a></Button></>}<Button variant="outline" onClick={() => setPreview(null)}>Close</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}

export default DocumentsTool;
