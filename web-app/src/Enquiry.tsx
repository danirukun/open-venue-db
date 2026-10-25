import { useMemo, useState } from "react"
import { X, Mail, Copy, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

const REFINE = "https://open-venue-db-whatsapp.vercel.app/api/refine-draft"
export type EnqCtx = { venue: string; address?: string; email?: string; cap?: string; fee?: string; kind: string; vtype?: string; people: string; when: string; budget: string; musts: string[] }

export function draft(c: EnqCtx, name: string) {
  const subject = `Venue enquiry: ${c.kind.toLowerCase()} for ${c.people || "?"} people, ${c.when}`
  const lines = [
    `Hello ${c.venue} team,`, "",
    `I organise community events in London and I'm looking for a space for a ${c.kind.toLowerCase()} for about ${c.people || "?"} people on ${c.when}.`,
    c.address ? `Would your space at ${c.address} be available then?` : "Would your space be available then?",
    /screening|film/i.test(c.kind) || c.vtype === "cinema" ? (c.vtype === "cinema" ? "It would be a film screening, so we'd be looking to hire one of your screens for a private or community showing. We can supply the film (DCP or digital file) and sort the screening licence, or work with your team on it." : "It would be a film screening, so we'd need a screen or blank wall, a projector and sound. We can sort the screening licence.") : "",
    c.musts.length ? `Ideally we'd need: ${c.musts.join(", ").toLowerCase()}.` : "",
    +c.budget > 0 ? `Our budget for room hire is around £${c.budget}.` : "We have little or no budget for room hire, but our guests would buy drinks and food.",
    c.fee && !/unknown/i.test(c.fee) ? `I saw a note that "${c.fee}". Could you confirm the terms?` : "Could you let me know your hire fee or any minimum spend?",
    "", "Many thanks,", name || "[Your name]",
  ]
  return { subject, body: lines.filter((l, i) => l !== "" || lines[i - 1] !== "").join("\n").replace(/\n\n\n+/g, "\n\n") }
}

export default function Enquiry({ ctx, onClose }: { ctx: EnqCtx; onClose: () => void }) {
  const [name, setName] = useState(() => localStorage.getItem("ovdb-name") || "")
  const init = useMemo(() => draft(ctx, name), [ctx])
  const [subject, setSubject] = useState(init.subject), [body, setBody] = useState(init.body)
  const [ask, setAsk] = useState(""), [busy, setBusy] = useState(false), [msg, setMsg] = useState("")
  const setNm = (n: string) => { const old = name || "[Your name]"; setName(n); localStorage.setItem("ovdb-name", n); setBody(b => b.endsWith(old) ? b.slice(0, -old.length) + (n || "[Your name]") : b) }
  const href = useMemo(() => {
    let b = body, h = ""
    for (let i = 0; i < 5; i++) { h = `mailto:${ctx.email ? encodeURIComponent(ctx.email) : ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(b)}`; if (h.length <= 1800) break; b = b.slice(0, Math.floor(b.length * 0.8)) + "…" }
    return h
  }, [subject, body, ctx.email])
  async function refine() {
    if (!ask.trim()) return
    setBusy(true); setMsg("")
    try {
      const r = await fetch(REFINE, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subject, body, instruction: ask.slice(0, 300) }) })
      const d = await r.json(); if (!r.ok || !d.body) throw 0
      setSubject(d.subject); setBody(d.body); setAsk(""); setMsg("Rewritten. Check the facts before sending.")
    } catch { setMsg("The agent isn't available right now. You can still edit the draft yourself.") }
    setBusy(false)
  }
  return (
    <div role="dialog" aria-modal="true" aria-label={`Enquiry to ${ctx.venue}`} className="fixed inset-0 z-[3000] bg-ink/40 grid place-items-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-xl max-h-[92vh] overflow-auto bg-white rounded-xl border border-ink/15 shadow-2xl p-5 space-y-3">
        <div className="flex justify-between items-start gap-3">
          <div><h2 className="text-lg font-semibold">Enquiry to {ctx.venue}</h2><p className="text-xs text-muted-foreground">{ctx.email ? `To: ${ctx.email}` : "We don't have this venue's email. Add it in your email app."}</p></div>
          <button aria-label="Close" onClick={onClose} className="size-8 grid place-items-center rounded-md hover:bg-ink/10"><X className="size-4" /></button>
        </div>
        <label className="block text-sm font-medium">Your name<Input value={name} onChange={e => setNm(e.target.value)} placeholder="[Your name]" className="mt-1" /></label>
        <label className="block text-sm font-medium">Subject<Input value={subject} onChange={e => setSubject(e.target.value)} className="mt-1" /></label>
        <label className="block text-sm font-medium">Message<textarea value={body} onChange={e => setBody(e.target.value)} rows={11} className="mt-1 w-full rounded-md border border-input p-2.5 text-sm leading-relaxed focus-visible:outline-2" /></label>
        <div className="flex gap-2">
          <Input aria-label="Ask the agent" value={ask} maxLength={300} onChange={e => setAsk(e.target.value)} onKeyDown={e => e.key === "Enter" && refine()} placeholder="Ask the agent, e.g. make it friendlier" />
          <Button variant="outline" onClick={refine} disabled={busy || !ask.trim()}><Sparkles className="size-4" />{busy ? "Rewriting…" : "Rewrite"}</Button>
        </div>
        {msg && <p className="text-xs text-muted-foreground" aria-live="polite">{msg}</p>}
        <div className="flex flex-wrap gap-2 pt-1">
          <a href={href} data-testid="mailto" className="inline-flex items-center gap-2 h-9 px-3 rounded-md bg-ink text-fog text-sm font-medium hover:bg-ink/85"><Mail className="size-4" />Open in email app</a>
          <Button variant="outline" onClick={() => { navigator.clipboard?.writeText(`Subject: ${subject}\n\n${body}`); setMsg("Copied.") }}><Copy className="size-4" />Copy</Button>
        </div>
        <p className="text-xs text-muted-foreground">Nothing is sent from Offpeak. "Open in email app" opens a draft in your own email app for you to check and send.</p>
      </div>
    </div>
  )
}
