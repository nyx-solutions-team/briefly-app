$p='src/components/html-document-preview.tsx' 
$s=[IO.File]::ReadAllText($p) 
$s=$s -replace 'branding\?: HtmlDocumentPreviewBranding \| null;\r?\n\s*className\?: string;','branding?: HtmlDocumentPreviewBranding | null;`r`n    zoom?: number;`r`n    className?: string;' 
$s=$s -replace 'branding,\r?\n\s*className,','branding,`r`n    zoom = 1,`r`n    className,' 
$s=$s -replace 'const iframeRef = useRef<HTMLIFrameElement>\(null\);','const iframeRef = useRef<HTMLIFrameElement>(null);`r`n    const normalizedZoom = Number.isFinite(zoom) ? Math.max(0.4, Math.min(2, zoom)) : 1;`r`n    const scaledHeight = Math.max(220, Math.ceil(height * normalizedZoom));`r`n    const scaledWidth = `${100 / normalizedZoom}`%;' 
$old = @' 
    return ( 
        <iframe 
            ref={iframeRef} 
            srcDoc={srcDoc} 
            sandbox=\"allow-same-origin\" 
            title=\"Document preview\" 
            style={{ height: `${height}px` }} 
            className={`w-full border-0 block ${className ?? ''}`} 
        /> 
