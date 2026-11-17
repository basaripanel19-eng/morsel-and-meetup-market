import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, FerrisWheel, LoaderCircle, RotateCw } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import { guestWheelSchema } from "@/lib/wheel-schema";

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
function spinCount() {
  try {
    const saved = JSON.parse(localStorage.getItem("carkspin") || "{}");
    return saved.d === today() ? saved.n : 0;
  } catch { return 0; }
}

/** Splits a prize name into one or two lines, like the original wheel. */
function wheelLines(t: string): string[] {
  const w = t.split(" ");
  if (w[0] === "Free") return [w[0], w.slice(1).join(" ")].filter(Boolean);
  if (w.length > 2) return [w[0] + " " + w[1], w.slice(2).join(" ")];
  return w;
}

/** Mount with the menu: settings load before the guest taps the wheel. */
export function GuestWheel({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const config = useQuery({
    queryKey: ["guest-wheel"],
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/public/wheel-config", { signal });
      if (!response.ok) throw new Error("Çark yüklenemedi.");
      return guestWheelSchema.parse(await response.json());
    },
    staleTime: 30_000,
    retry: 1,
  });
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [winner, setWinner] = useState<number | null>(null);
  const [error, setError] = useState("");
  const frame = useRef<number | null>(null);
  const spinning = useRef(false);
  useEffect(() => {
    if (open) setCount(spinCount());
  }, [open]);
  useEffect(() => () => { if (frame.current !== null) cancelAnimationFrame(frame.current); }, []);
  const settings = config.data;
  const prizes = settings?.prizes ?? [];
  const full = !!settings && settings.max_spins > 0 && count >= settings.max_spins;
  const result = winner === null ? undefined : prizes[winner];

  async function spin() {
    if (!settings || spinning.current || full) return;
    spinning.current = true;
    setBusy(true); setWinner(null); setError("");
    try {
      const response = await fetch("/api/public/wheel-spin", { method: "POST" });
      if (!response.ok) throw new Error("Şu anda çevrilemiyor. Lütfen tekrar deneyin.");
      const result: { index: number } = await response.json();
      if (!Number.isInteger(result.index) || !prizes[result.index]) throw new Error("Lütfen tekrar deneyin.");
      const next = spinCount() + 1;
      try { localStorage.setItem("carkspin", JSON.stringify({ d: today(), n: next })); } catch { /* storage may be blocked */ }
      setCount(next);
      const target = 270 - (result.index + 0.5) * 360 / prizes.length;
      const current = ((rotation % 360) + 360) % 360;
      const delta = ((target - current) % 360 + 360) % 360 + 360 * 6;
      const started = performance.now();
      const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 5000;
      const animate = (now: number) => {
        const progress = duration === 0 ? 1 : Math.min(1, (now - started) / duration);
        setRotation(rotation + delta * (1 - Math.pow(1 - progress, 4)));
        if (progress < 1) frame.current = requestAnimationFrame(animate);
        else { setWinner(result.index); setBusy(false); spinning.current = false; }
      };
      frame.current = requestAnimationFrame(animate);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lütfen tekrar deneyin.");
      setBusy(false); spinning.current = false;
    }
  }

  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-overlay" />
      <Dialog.Content aria-describedby={undefined} className="fixed inset-0 z-50 mx-auto flex max-w-lg flex-col overflow-y-auto bg-background text-foreground outline-none">
        <header className="flex min-h-16 shrink-0 items-center gap-3 border-b border-border px-4 py-3">
          <Dialog.Close asChild><Button variant="ghost" size="icon" aria-label="Menüye dön" title="Menüye dön"><ArrowLeft className="size-5" /></Button></Dialog.Close>
          <Dialog.Title className="min-w-0 break-words text-lg font-semibold">{settings?.title || "Şans Çarkı"}</Dialog.Title>
        </header>
        <div className="flex flex-1 flex-col items-center px-5 py-6">
          {settings?.subtitle && <p className="mb-6 text-center text-sm text-muted-foreground">{settings.subtitle}</p>}
          <div className="relative my-auto aspect-square w-full max-w-80 shrink-0">
            {prizes.length > 0 ? <>
              <svg viewBox="0 0 680 680" role="img" aria-label="Ödül çarkı" className="h-full w-full">
                <defs><filter id="wheel-text-shadow" x="-20%" y="-50%" width="140%" height="200%"><feDropShadow dx="0" dy="0" stdDeviation="1.5" floodColor="#000" floodOpacity="0.35" /></filter></defs>
                <g transform={`rotate(${rotation} 340 340)`}>
                  {prizes.map((prize, i) => {
                    const arc = Math.PI * 2 / prizes.length;
                    const a = i * arc, b = a + arc;
                    const lines = wheelLines(prize.t);
                    const longest = Math.max(...lines.map((l) => l.length));
                    const size = Math.max(14, Math.min(26, Math.floor(140 / (longest * 0.58))));
                    return <g key={prize.t}>
                      <path d={`M340 340 L${340 + 332 * Math.cos(a)} ${340 + 332 * Math.sin(a)} A332 332 0 ${arc > Math.PI ? 1 : 0} 1 ${340 + 332 * Math.cos(b)} ${340 + 332 * Math.sin(b)} Z`} fill={prize.c} stroke="#fff" strokeWidth="4" />
                      <g transform={`translate(340 340) rotate(${(a + arc / 2) * 180 / Math.PI})`}>
                        <text x="292" y="3" fontSize="46" textAnchor="middle" dominantBaseline="middle" transform="rotate(90 292 3)">{prize.e}</text>
                        <g filter="url(#wheel-text-shadow)" fill="#fff" fontWeight="700" fontSize={size} textAnchor="end" dominantBaseline="middle" fontFamily="system-ui, sans-serif">
                          {lines.map((line, n) => <text key={n} x="246" y={lines.length > 1 ? (n === 0 ? -15 : 15) : 0}>{line}</text>)}
                        </g>
                      </g>
                    </g>;
                  })}
                </g>
                <circle cx="340" cy="340" r="34" fill="#fff" stroke="#d9480f" strokeWidth="6" />
              </svg>
              <div aria-hidden className="absolute -top-3 left-1/2 h-0 w-0 -translate-x-1/2 border-x-[15px] border-t-[32px] border-x-transparent border-t-[#d9480f] drop-shadow" />
            </> : <div className="flex h-full items-center justify-center rounded-full bg-secondary text-muted-foreground">
              {config.isError ? <FerrisWheel className="size-16" /> : <LoaderCircle aria-label="Çark yükleniyor" className="size-10 animate-spin motion-reduce:animate-none" />}
            </div>}
          </div>
          <div className="mt-6 w-full max-w-80 space-y-4 pb-4 text-center">
            {result && <div role="status" className="space-y-1"><p className="text-4xl">{result.e}</p><p className="text-sm text-muted-foreground">{result.x ? "Bu kez olmadı" : "Tebrikler! Kazandınız:"}</p><p className="break-words text-xl font-semibold">{result.x ? "Bir dahaki sefere bol şans!" : result.t}</p></div>}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            {config.isError ? <><p role="alert" className="text-sm text-muted-foreground">Çark yüklenemedi.</p><Button variant="secondary" className="w-full" onClick={() => void config.refetch()}><RotateCw className="size-4" />Tekrar dene</Button></> : <Button className="h-12 w-full gap-2" disabled={!settings || busy || full} onClick={() => void spin()}>
              {busy ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" /> : <FerrisWheel className="size-5" />}
              {busy ? "Çevriliyor…" : full ? "Bugünkü hakkınız doldu" : !settings ? "Yükleniyor…" : "Çarkı çevir"}
            </Button>}
            {settings && settings.max_spins > 0 && <p className="text-xs text-muted-foreground">{full ? "Yarın tekrar bekleriz." : `${Math.max(0, settings.max_spins - count)} hakkınız kaldı`}</p>}
          </div>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}