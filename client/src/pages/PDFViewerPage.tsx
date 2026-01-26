import { useParams, useLocation } from "wouter";
import { PDFViewer } from "@/components/PDFViewer";

export default function PDFViewerPage() {
  const params = useParams<{ projectId: string; fileId: string }>();
  const [, setLocation] = useLocation();
  
  const searchParams = new URLSearchParams(window.location.search);
  const fileName = searchParams.get("name") || "Document.pdf";
  const objectPath = searchParams.get("path") || "";
  
  const fileUrl = objectPath || "";

  const handleClose = () => {
    setLocation(`/projects/${params.projectId}`);
  };

  const handleShare = async () => {
    try {
      const response = await fetch(fileUrl);
      const blob = await response.blob();
      const fileToShare = new File([blob], fileName, { type: 'application/pdf' });
      
      if (navigator.canShare && navigator.canShare({ files: [fileToShare] })) {
        await navigator.share({
          files: [fileToShare],
          title: fileName,
        });
      } else {
        await navigator.clipboard.writeText(window.location.href);
        alert("Link copied to clipboard!");
      }
    } catch (error) {
      console.error("Share failed:", error);
    }
  };

  if (!fileUrl) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-900">
        <div className="text-white text-center">
          <p className="text-lg">PDF not found</p>
          <button 
            onClick={handleClose}
            className="mt-4 px-4 py-2 bg-primary text-white rounded hover:bg-primary/90"
            data-testid="button-back-to-project"
          >
            Back to Project
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen fixed inset-0 z-50 bg-gray-900">
      <PDFViewer
        url={fileUrl}
        fileName={fileName}
        onClose={handleClose}
        onShare={handleShare}
      />
    </div>
  );
}
