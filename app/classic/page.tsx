'use client';
// Language links intentionally reload the page to restart the Java runtime.
/* eslint-disable next/no-html-link-for-pages */
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  FolderOpen,
  Maximize,
  CircleHelp,
  Download,
  Upload,
  RefreshCw,
} from 'lucide-react';
declare global {
  interface Window {
    taprats: {
      attachDisplay?: (host: HTMLElement | null) => void;
      listFiles: () => Promise<SavedFile[]>;
      importFile: (file: File) => Promise<string>;
      downloadFile: (path: string) => Promise<void>;
    };
    __tapratsStarted?: boolean;
    __tapratsStatus?: { message: string; state: string };
  }
}
type SavedFile = { name: string; path: string; size: number };
export default function Home() {
  const [status, setStatus] = useState('Starting Taprats…');
  const [ready, setReady] = useState(false),
    [failed, setFailed] = useState(false),
    [closed, setClosed] = useState(false);
  const [filesOpen, setFilesOpen] = useState(false),
    [helpOpen, setHelpOpen] = useState(false);
  const [files, setFiles] = useState<SavedFile[]>([]),
    [message, setMessage] = useState('');
  const upload = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const listener = (e: Event) => {
      const d = (e as CustomEvent).detail;
      setStatus(d.message);
      setReady(d.state === 'ready');
      setFailed(d.state === 'error');
      setClosed(d.state === 'closed');
      window.taprats?.attachDisplay?.(
        document.getElementById('taprats-display'),
      );
    };
    window.addEventListener('taprats-status', listener);
    window.taprats?.attachDisplay?.(document.getElementById('taprats-display'));
    if (window.__tapratsStatus)
      listener(
        new CustomEvent('taprats-status', { detail: window.__tapratsStatus }),
      );
    if (!window.__tapratsStarted) {
      const script = document.createElement('script');
      script.src = '/runtime.js';
      script.type = 'module';
      document.body.appendChild(script);
    }
    return () => window.removeEventListener('taprats-status', listener);
  }, []);
  async function refresh() {
    try {
      setFiles(await window.taprats.listFiles());
    } catch (e) {
      setMessage(String(e));
    }
  }
  async function importFiles(selected: FileList | null) {
    if (!selected) return;
    try {
      for (const file of Array.from(selected))
        await window.taprats.importFile(file);
      setMessage(
        `${selected.length} file(s) imported. Open from /files/workspace in Taprats.`,
      );
      await refresh();
    } catch (e) {
      setMessage(`Import failed: ${String(e)}`);
    }
    if (upload.current) upload.current.value = '';
  }
  return (
    <main className="studio">
      <header className="studio-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            ✳
          </span>
          <h1>Taprats</h1>
          <span className="version">1.1.12 · Web</span>
        </div>
        <nav aria-label="Browser tools">
          <Button
            variant="ghost"
            disabled={!ready && !closed}
            onClick={() => {
              setFilesOpen(true);
              void refresh();
            }}
          >
            <FolderOpen size={18} />
            Files
          </Button>
          <Button variant="ghost" onClick={() => setHelpOpen(true)}>
            <CircleHelp size={18} />
            <span className="button-label">Help</span>
          </Button>
          <Button
            variant="ghost"
            aria-label="Toggle full screen"
            onClick={async () => {
              try {
                if (document.fullscreenElement) await document.exitFullscreen();
                else await document.documentElement.requestFullscreen();
              } catch {
                setStatus(
                  'Use your browser’s full screen command to expand the workspace.',
                );
              }
            }}
          >
            <Maximize size={18} />
          </Button>
        </nav>
      </header>
      <section
        className="workspace"
        aria-label="Taprats pattern and tiling editor"
      >
        <div id="taprats-display" />
        {!ready && (
          <div className="startup" role={failed ? 'alert' : 'status'}>
            <span
              className={failed ? 'startup-mark' : 'startup-mark turning'}
              aria-hidden="true"
            >
              ✳
            </span>
            <h2>
              {closed
                ? 'Workspace closed'
                : failed
                  ? 'Taprats could not start'
                  : 'Opening your workspace'}
            </h2>
            <p>{status}</p>
            {!closed && (
              <p className="secondary">
                The first launch downloads the browser runtime and may take a
                minute.
              </p>
            )}
            {(failed || closed) && (
              <Button onClick={() => location.reload()}>
                <RefreshCw size={16} />
                {closed ? 'Reopen Taprats' : 'Try again'}
              </Button>
            )}
          </div>
        )}
      </section>
      <footer className="studio-footer">
        <output>
          <i className={ready ? 'ready-dot' : 'loading-dot'} />
          {ready ? 'Ready' : status}
        </output>
        <span>
          Designs and tilings stay in this browser. Use Files to import or
          download.
        </span>
      </footer>
      <Dialog open={filesOpen} onOpenChange={setFilesOpen}>
        <DialogContent className="files-dialog">
          <DialogHeader>
            <DialogTitle>Your files</DialogTitle>
            <DialogDescription>
              Save designs, tilings, and exports in{' '}
              <code>/files/workspace</code>, then download them here.
            </DialogDescription>
          </DialogHeader>
          <div className="file-actions">
            <Button onClick={() => upload.current?.click()}>
              <Upload size={16} />
              Import files
            </Button>
            <Button variant="outline" onClick={refresh}>
              <RefreshCw size={16} />
              Refresh
            </Button>
          </div>
          <input
            ref={upload}
            type="file"
            multiple
            hidden
            onChange={(e) => importFiles(e.target.files)}
          />
          <output className="file-message">
            {message ||
              'Imported files are available in the app’s Open dialogs. Browser storage persists between visits.'}
          </output>
          <ul className="file-list">
            {files.map((file) => (
              <li key={file.path}>
                <div>
                  <strong>{file.name}</strong>
                  <small>{(file.size / 1024).toFixed(1)} KB</small>
                </div>
                <Button
                  variant="ghost"
                  aria-label={`Download ${file.name}`}
                  onClick={async () => {
                    try {
                      await window.taprats.downloadFile(file.path);
                    } catch (e) {
                      setMessage(`Download failed: ${String(e)}`);
                    }
                  }}
                >
                  <Download size={18} />
                </Button>
              </li>
            ))}
          </ul>
          {!files.length && (
            <p className="empty-files">
              No saved files yet. Import an existing .tap or .tiling file, or
              save your first design in Taprats.
            </p>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Working in Taprats</DialogTitle>
            <DialogDescription>
              The original Taprats tools, running in your browser.
            </DialogDescription>
          </DialogHeader>
          <div className="help-copy">
            <p>
              <strong>Start a pattern.</strong> Choose File → Select Example, or
              add a layer and choose a tiling. Edit its figures, then select a
              rendering style.
            </p>
            <p>
              <strong>Create a tiling.</strong> Choose File → New Tiling to
              draw, arrange, and join polygons and define the two translation
              vectors.
            </p>
            <p>
              <strong>Move the view.</strong> Use Pan View, Rotate View, and
              Zoom View. Transform All Layers switches between the whole design
              and the selected layer.
            </p>
            <p>
              <strong>Bring files in and out.</strong> Use Files → Import files.
              In Taprats, open or save under <code>/files/workspace</code>.
              Return to Files to download designs, image previews, tilings, or
              exports. Clearing browser data removes browser-saved files.
            </p>
            <p>
              <strong>More room.</strong> Use the full screen button. On small
              screens, scroll the workspace to reach all tools. A mouse or
              trackpad is best for precise drawing.
            </p>
            <p>
              <strong>Language.</strong> <a href="/?lang=en">English</a> ·{' '}
              <a href="/?lang=fr">Français</a> (restarts the app; save first).
            </p>
            <p className="secondary">
              Taprats 1.1.12 by Craig S. Kaplan and contributors. Powered by{' '}
              <a
                href="https://cheerpj.com/docs/overview.html"
                target="_blank"
                rel="noreferrer"
              >
                CheerpJ
              </a>
              . An internet connection is needed to load the runtime.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
