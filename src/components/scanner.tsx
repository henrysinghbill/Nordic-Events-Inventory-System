"use client";

import { BarcodeDetector, prepareZXingModule } from "barcode-detector/ponyfill";
import { useEffect, useRef, useState } from "react";
import { CloseIcon } from "./icons";
import { Button, cx, inputClass } from "./ui";

// Serve the scanner engine from this app (copied to public/vendor on install), never a CDN.
prepareZXingModule({
  overrides: {
    locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? `/vendor/${path}` : prefix + path),
  },
});

let detector: BarcodeDetector | null = null;
function getDetector() {
  detector ??= new BarcodeDetector({ formats: ["qr_code", "code_128"] });
  return detector;
}

function cameraErrorMessage(err: unknown): string {
  const name = (err as { name?: string })?.name;
  if (!window.isSecureContext) return "The camera only works over HTTPS. Type the code below instead.";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Camera access was blocked. Allow camera access for this site in your browser settings, or type the code below.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No camera was found on this device. Type the code below.";
  if (name === "NotReadableError") return "The camera is being used by another app. Close it and try again.";
  return "The camera couldn't be started. Type the code below instead.";
}

/**
 * Full-screen camera view that reads QR codes and Code 128 barcodes.
 * Calls onDetected once with the raw value, then stops the camera.
 */
export function CameraScanner({
  onDetected,
  onClose,
  hint = "Point the camera at a box label or the DHL barcode starting JD",
}: {
  onDetected: (value: string) => void;
  onClose: () => void;
  hint?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const detectedRef = useRef(onDetected);
  useEffect(() => {
    detectedRef.current = onDetected;
  }, [onDetected]);

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError(cameraErrorMessage(new Error("unsupported")));
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
      } catch (err) {
        if (!stopped) setError(cameraErrorMessage(err));
        return;
      }
      const video = videoRef.current;
      if (stopped || !video) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        /* iOS may need the muted/playsInline attributes, which are set */
      }
      setReady(true);

      const tick = async () => {
        if (stopped) return;
        try {
          if (video.readyState >= 2) {
            const codes = await getDetector().detect(video);
            const value = codes.find((c) => c.rawValue)?.rawValue;
            if (value && !stopped) {
              stopped = true;
              navigator.vibrate?.(80);
              stream?.getTracks().forEach((t) => t.stop());
              detectedRef.current(value);
              return;
            }
          }
        } catch {
          /* a frame that can't be read; keep trying */
        }
        timer = setTimeout(tick, 120);
      };
      tick();
    }
    start();

    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white" role="dialog" aria-label="Scanner">
      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} muted playsInline className="absolute inset-0 h-full w-full object-cover" />
        {ready && !error && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-1/3 w-5/6 max-w-md rounded-2xl border-4 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
          </div>
        )}
        {!ready && !error && <p className="absolute inset-0 flex items-center justify-center text-lg">Starting camera…</p>}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <p role="alert" className="max-w-sm rounded-xl bg-red-700 p-4 text-center font-medium">
              {error}
            </p>
          </div>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close scanner"
          className="absolute top-3 right-3 rounded-full bg-black/60 p-3"
          style={{ marginTop: "env(safe-area-inset-top)" }}
        >
          <CloseIcon size={28} />
        </button>
      </div>
      <p className="bottom-safe bg-black px-4 py-4 text-center">{hint}</p>
    </div>
  );
}

/**
 * "Scan" button plus a text field for typing the code when a label can't be read.
 * Calls onValue with whatever was scanned or typed.
 */
export function ScanOrType({
  onValue,
  pending = false,
  autoOpen = false,
  scanLabel = "Scan",
  placeholder = "BOX-0047, JD… piece ID or waybill",
  hint,
}: {
  onValue: (value: string) => void;
  pending?: boolean;
  autoOpen?: boolean;
  scanLabel?: string;
  placeholder?: string;
  hint?: string;
}) {
  const [open, setOpen] = useState(autoOpen);
  const [typed, setTyped] = useState("");
  return (
    <div className="space-y-3">
      <Button className="min-h-14 w-full text-lg" onClick={() => setOpen(true)} disabled={pending}>
        {scanLabel}
      </Button>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (typed.trim()) onValue(typed.trim());
        }}
      >
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={placeholder}
          aria-label="Type a code instead"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          className={cx(inputClass, "flex-1")}
        />
        <Button type="submit" variant="secondary" disabled={pending || !typed.trim()}>
          {pending ? "…" : "Go"}
        </Button>
      </form>
      {open && (
        <CameraScanner
          hint={hint}
          onClose={() => setOpen(false)}
          onDetected={(value) => {
            setOpen(false);
            onValue(value);
          }}
        />
      )}
    </div>
  );
}
