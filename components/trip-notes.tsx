"use client"

import { useEffect, useState, useRef } from "react"
import { useAuth } from "@/lib/auth-context"
import { useDialog } from "@/components/dialog-provider"
import { getUsers } from "@/lib/firestore"
import { FilePreview } from "@/components/file-preview"
// Trip notes now use the D1 API via /api/itineraries/[id]/tripNotes
import { Send, Clock, Tag, MessageSquare, AlertCircle, Trash2, Pencil, Paperclip, AtSign, Loader2 } from "lucide-react"

const STORAGE_WORKER = "https://outbound-storage.outboundmanagementsystem.workers.dev"

interface TripNotesProps {
    itineraryId: string
}

interface Note {
    id: string
    message: string
    category: string
    createdByUid: string
    createdByName: string
    createdByRole: string
    createdAt: any
    editedAt?: any
    attachments?: string[]
}

const CATEGORIES = [
    "General",
    "Customer Preference",
    "Payment Update",
    "DMC/Supplier Update",
    "Hotel/Flight Update",
    "Issue/Escalation",
    "Shift Handover",
    "Tour Completion"
]

export default function TripNotes({ itineraryId }: TripNotesProps) {
    const { userProfile } = useAuth()
    const { showDialog } = useDialog()
    const [notes, setNotes] = useState<Note[]>([])
    const [message, setMessage] = useState("")
    const [category, setCategory] = useState("General")
    const [sending, setSending] = useState(false)
    const [confirmId, setConfirmId] = useState<string | null>(null)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editText, setEditText] = useState("")
    const [savingEdit, setSavingEdit] = useState(false)
    const bottomRef = useRef<HTMLDivElement>(null)
    // F5 attachments
    const [attachments, setAttachments] = useState<string[]>([])
    const [uploading, setUploading] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)
    // F4 @mention
    const [mentionUsers, setMentionUsers] = useState<{ uid: string; name: string; role: string }[]>([])
    const [mentionOpen, setMentionOpen] = useState(false)
    const [mentionQuery, setMentionQuery] = useState("")
    const inputRef = useRef<HTMLInputElement>(null)

    // Load mentionable users (sales, pre-ops, post-ops) once.
    useEffect(() => {
        getUsers().then((all: any[]) => {
            const m = (all || [])
                .filter(u => /sales|pre_ops|pre-ops|preops|post_ops|post-ops|postops/i.test(u.role || ""))
                .map(u => ({ uid: u.uid, name: u.name || u.email || "User", role: u.role || "" }))
            setMentionUsers(m)
        }).catch(() => {})
    }, [])

    // Detect an "@query" token immediately before the caret to drive the mention dropdown.
    const handleMessageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value
        setMessage(val)
        const caret = e.target.selectionStart ?? val.length
        const before = val.slice(0, caret)
        const m = before.match(/@([^\s@]*)$/)
        if (m) { setMentionQuery(m[1]); setMentionOpen(true) } else { setMentionOpen(false); setMentionQuery("") }
    }

    const pickMention = (name: string) => {
        const el = inputRef.current
        const caret = el?.selectionStart ?? message.length
        const before = message.slice(0, caret).replace(/@([^\s@]*)$/, `@${name} `)
        const next = before + message.slice(caret)
        setMessage(next)
        setMentionOpen(false)
        setMentionQuery("")
        setTimeout(() => { el?.focus(); const pos = before.length; el?.setSelectionRange(pos, pos) }, 0)
    }

    const filteredMentions = mentionUsers
        .filter(u => u.name.toLowerCase().includes(mentionQuery.toLowerCase()))
        .slice(0, 6)

    const handleAttach = async (files: FileList | null) => {
        if (!files || !files.length) return
        setUploading(true)
        try {
            const urls: string[] = []
            for (const file of Array.from(files)) {
                const url = `${STORAGE_WORKER}/notes/${itineraryId}/${Date.now()}_${encodeURIComponent(file.name)}`
                const res = await fetch(url, { method: "PUT", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } })
                if (!res.ok) throw new Error("upload failed")
                urls.push(url)
            }
            setAttachments(prev => [...prev, ...urls])
        } catch {
            showDialog({ title: "Upload failed", message: "Could not upload the attachment. Please try again.", type: "error" })
        } finally {
            setUploading(false)
            if (fileInputRef.current) fileInputRef.current.value = ""
        }
    }

    // Render a note message with @mentions highlighted (WhatsApp style).
    const renderMessage = (text: string, isSelf: boolean) => {
        const names = mentionUsers.map(u => u.name).filter(Boolean).sort((a, b) => b.length - a.length)
        if (!text || !names.length) return text
        const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        const re = new RegExp(`@(${names.map(esc).join("|")})`, "g")
        const out: any[] = []
        let last = 0, mm: RegExpExecArray | null
        while ((mm = re.exec(text)) !== null) {
            if (mm.index > last) out.push(text.slice(last, mm.index))
            out.push(<span key={mm.index} className="font-bold" style={{ color: isSelf ? "#d1fae5" : "#06a15c" }}>{mm[0]}</span>)
            last = mm.index + mm[0].length
        }
        if (last < text.length) out.push(text.slice(last))
        return out
    }

    const loadNotes = async () => {
        if (!itineraryId) return
        try {
            const data = await fetch(`/api/itineraries/${itineraryId}/tripNotes`).then(r => r.json())
            setNotes((data || []).sort((a: Note, b: Note) => (a.createdAt > b.createdAt ? 1 : -1)))
        } catch { /* silent */ }
    }

    useEffect(() => { loadNotes() }, [itineraryId])

    // Auto scroll to bottom when notes list updates
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" })
    }, [notes])

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault()
        // Allow sending an attachment-only note (no text) too.
        if ((!message.trim() && attachments.length === 0) || sending || uploading || !userProfile) return

        setSending(true)
        try {
            await fetch(`/api/itineraries/${itineraryId}/tripNotes`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: message.trim(), category,
                    createdByUid: userProfile.uid,
                    createdByName: userProfile.name || "Anonymous",
                    createdByRole: userProfile.role || "user",
                    createdAt: new Date().toISOString(),
                    attachments,
                })
            })
            setMessage("")
            setCategory("General")
            setAttachments([])
            await loadNotes()
        } catch (err) {
            console.error("Failed to add trip note:", err)
            showDialog({
                title: "Error",
                message: "Failed to send internal note. Please check your connection.",
                type: "error"
            })
        } finally {
            setSending(false)
        }
    }

    const handleDelete = async (noteId: string) => {
        setDeletingId(noteId)
        try {
            await fetch(`/api/itineraries/${itineraryId}/tripNotes/${noteId}`, { method: "DELETE" })
            setConfirmId(null)
            await loadNotes()
        } catch (err) {
            console.error("Failed to delete trip note:", err)
            showDialog({
                title: "Error",
                message: "Failed to delete the note. Please check your connection and try again.",
                type: "error"
            })
        } finally {
            setDeletingId(null)
        }
    }

    const startEdit = (note: Note) => {
        setConfirmId(null)
        setEditingId(note.id)
        setEditText(note.message)
    }

    const cancelEdit = () => {
        setEditingId(null)
        setEditText("")
    }

    const handleSaveEdit = async (noteId: string) => {
        const trimmed = editText.trim()
        if (!trimmed || savingEdit) return
        setSavingEdit(true)
        try {
            await fetch(`/api/itineraries/${itineraryId}/tripNotes/${noteId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: trimmed, editedAt: new Date().toISOString() })
            })
            cancelEdit()
            await loadNotes()
        } catch (err) {
            console.error("Failed to edit trip note:", err)
            showDialog({
                title: "Error",
                message: "Failed to save your changes. Please check your connection and try again.",
                type: "error"
            })
        } finally {
            setSavingEdit(false)
        }
    }

    const formatDateTime = (createdAt: any) => {
        if (!createdAt) return "Just now"
        
        let date: Date
        if (createdAt.toDate) {
            date = createdAt.toDate()
        } else {
            date = new Date(createdAt)
        }

        if (isNaN(date.getTime())) return "Just now"

        return date.toLocaleString([], {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: true
        })
    }

    const getRoleBadgeClasses = (role: string) => {
        const lower = (role || "").toLowerCase()
        if (lower.includes("sales")) {
            return "text-indigo-700 bg-indigo-50 border-indigo-100/80"
        }
        if (lower.includes("pre_ops") || lower.includes("pre-ops") || lower.includes("preops")) {
            return "text-emerald-700 bg-emerald-50 border-emerald-100/80"
        }
        if (lower.includes("post_ops") || lower.includes("post-ops") || lower.includes("postops")) {
            return "text-amber-700 bg-amber-50 border-amber-100/80"
        }
        if (lower.includes("admin") || lower.includes("owner")) {
            return "text-rose-700 bg-rose-50 border-rose-100/80"
        }
        return "text-gray-600 bg-gray-50 border-gray-100"
    }

    const formatRoleLabel = (role: string) => {
        const lower = (role || "").toLowerCase()
        if (lower.includes("sales")) return "Sales"
        if (lower.includes("pre_ops") || lower.includes("pre-ops") || lower.includes("preops")) return "Pre-Ops"
        if (lower.includes("post_ops") || lower.includes("post-ops") || lower.includes("postops")) return "Post-Ops"
        if (lower.includes("admin") || lower.includes("owner")) return "Admin"
        return "Team"
    }

    const getCategoryBadgeClasses = (cat: string) => {
        switch (cat) {
            case "Customer Preference":
                return "text-blue-600 bg-blue-50/50 border-blue-100"
            case "Payment Update":
                return "text-emerald-600 bg-emerald-50/50 border-emerald-100"
            case "DMC/Supplier Update":
                return "text-purple-600 bg-purple-50/50 border-purple-100"
            case "Hotel/Flight Update":
                return "text-sky-600 bg-sky-50/50 border-sky-100"
            case "Issue/Escalation":
                return "text-red-600 bg-red-50/50 border-red-100"
            case "Shift Handover":
                return "text-orange-600 bg-orange-50/50 border-orange-100"
            case "Tour Completion":
                return "text-teal-600 bg-teal-50/50 border-teal-100"
            default:
                return "text-gray-500 bg-gray-50 border-gray-100"
        }
    }

    return (
        <div className="flex flex-col h-[550px] bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden animate-in fade-in zoom-in duration-300">
            {/* Header info */}
            <div className="px-6 py-4 border-b border-gray-50 bg-gray-50/20 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600">
                        <MessageSquare className="w-4 h-4" />
                    </div>
                    <div>
                        <h4 className="font-serif text-sm font-bold text-[#052210]">Internal Trip Notes</h4>
                        <p className="font-sans text-[10px] text-gray-400">Collaborative timeline for Sales, Pre-Ops, & Post-Ops updates</p>
                    </div>
                </div>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 font-sans text-[9px] font-bold uppercase tracking-wider">
                    {notes.length} note{notes.length !== 1 ? "s" : ""}
                </span>
            </div>

            {/* Notes Timeline Stream */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-50/20 no-scrollbar">
                {notes.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-3">
                        <div className="w-12 h-12 rounded-full bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-300">
                            <Clock className="w-5 h-5 animate-pulse" />
                        </div>
                        <div>
                            <p className="font-sans text-xs font-bold text-gray-500 uppercase tracking-widest">No Notes Posted Yet</p>
                            <p className="font-sans text-[11px] text-gray-400 mt-1 max-w-[240px] leading-relaxed">Add remarks, shift handovers, or preferences to coordinate with the operations teams.</p>
                        </div>
                    </div>
                ) : (
                    notes.map((note) => {
                        const isSelf = userProfile?.uid === note.createdByUid
                        return (
                            <div
                                key={note.id}
                                className={`group flex flex-col ${isSelf ? "items-end" : "items-start"} space-y-1 animate-in slide-in-from-bottom-2 duration-300`}
                            >
                                {/* Time, Sender, & Badges row */}
                                <div className="flex items-center gap-2 text-[10px] text-gray-400 font-medium">
                                    <span className="font-sans font-bold text-gray-700">{note.createdByName}</span>
                                    <span className={`px-1.5 py-0.2 rounded border font-sans text-[8px] font-black uppercase tracking-wider ${getRoleBadgeClasses(note.createdByRole)}`}>
                                        {formatRoleLabel(note.createdByRole)}
                                    </span>
                                    <span className="w-1 h-1 rounded-full bg-gray-300" />
                                    <span>{formatDateTime(note.createdAt)}</span>
                                    {note.editedAt && (
                                        <span className="italic text-gray-400">(edited)</span>
                                    )}
                                </div>

                                {/* Message card (+ edit/delete controls for own notes) */}
                                <div className={`flex items-center gap-1.5 max-w-[85%] ${isSelf ? "flex-row" : "flex-row-reverse"}`}>
                                    {isSelf && editingId !== note.id && (
                                        <div className="flex items-center gap-0.5 shrink-0">
                                            <button
                                                onClick={() => startEdit(note)}
                                                className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity p-1.5 rounded-full text-gray-400 hover:text-emerald-600 hover:bg-emerald-50"
                                                title="Edit note"
                                                aria-label="Edit note"
                                            >
                                                <Pencil className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                onClick={() => setConfirmId(prev => prev === note.id ? null : note.id)}
                                                className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity p-1.5 rounded-full text-gray-400 hover:text-red-500 hover:bg-red-50"
                                                title="Delete note"
                                                aria-label="Delete note"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    )}
                                    <div
                                        className={`rounded-2xl px-4 py-3 border shadow-sm ${
                                            isSelf
                                                ? "bg-[#06a15c] text-white border-emerald-600/20 rounded-tr-none"
                                                : "bg-white text-[#052210] border-gray-100 rounded-tl-none"
                                        }`}
                                    >
                                        {/* Category tag */}
                                        {note.category && note.category !== "General" && (
                                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wide border mb-1.5 ${
                                                isSelf
                                                    ? "bg-white/10 text-emerald-100 border-white/15"
                                                    : getCategoryBadgeClasses(note.category)
                                            }`}>
                                                <Tag className="w-2.5 h-2.5" />
                                                {note.category}
                                            </span>
                                        )}

                                        {editingId === note.id ? (
                                            <div className="space-y-2">
                                                <textarea
                                                    value={editText}
                                                    onChange={(e) => setEditText(e.target.value)}
                                                    rows={2}
                                                    autoFocus
                                                    disabled={savingEdit}
                                                    onKeyDown={(e) => {
                                                        if (e.key === "Enter" && !e.shiftKey) {
                                                            e.preventDefault()
                                                            handleSaveEdit(note.id)
                                                        } else if (e.key === "Escape") {
                                                            cancelEdit()
                                                        }
                                                    }}
                                                    className="w-full min-w-[200px] px-2.5 py-1.5 rounded-lg text-xs sm:text-sm text-[#052210] bg-white border border-emerald-200 outline-none focus:border-emerald-400 resize-none font-medium"
                                                />
                                                <div className="flex items-center justify-end gap-2">
                                                    <button
                                                        onClick={cancelEdit}
                                                        disabled={savingEdit}
                                                        className={`font-sans text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded transition-colors ${isSelf ? "text-emerald-50 hover:text-white" : "text-gray-500 hover:text-gray-800"}`}
                                                    >
                                                        Cancel
                                                    </button>
                                                    <button
                                                        onClick={() => handleSaveEdit(note.id)}
                                                        disabled={!editText.trim() || savingEdit}
                                                        className="font-sans text-[10px] font-bold uppercase tracking-wide text-[#06a15c] bg-white hover:bg-emerald-50 px-2.5 py-0.5 rounded disabled:opacity-50 transition-colors"
                                                    >
                                                        {savingEdit ? "Saving..." : "Save"}
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                {note.message && (
                                                    <p className="font-sans text-xs sm:text-sm leading-relaxed whitespace-pre-wrap font-medium">
                                                        {renderMessage(note.message, isSelf)}
                                                    </p>
                                                )}
                                                {Array.isArray(note.attachments) && note.attachments.length > 0 && (
                                                    <div className="flex flex-wrap gap-2 mt-2">
                                                        {note.attachments.map((url: string, i: number) => (
                                                            <FilePreview key={i} url={url} size={64} />
                                                        ))}
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* Inline delete confirmation */}
                                {isSelf && confirmId === note.id && (
                                    <div className="flex items-center gap-2 mt-0.5 px-2.5 py-1.5 rounded-lg bg-red-50 border border-red-200 animate-in fade-in slide-in-from-top-1 duration-200">
                                        <span className="font-sans text-[10px] font-bold text-red-600">Delete this note?</span>
                                        <button
                                            onClick={() => handleDelete(note.id)}
                                            disabled={deletingId === note.id}
                                            className="font-sans text-[10px] font-bold uppercase tracking-wide text-white bg-red-500 hover:bg-red-600 px-2.5 py-0.5 rounded disabled:opacity-50 transition-colors"
                                        >
                                            {deletingId === note.id ? "Deleting..." : "Delete"}
                                        </button>
                                        <button
                                            onClick={() => setConfirmId(null)}
                                            disabled={deletingId === note.id}
                                            className="font-sans text-[10px] font-bold uppercase tracking-wide text-gray-500 hover:text-gray-800 px-2 py-0.5 rounded transition-colors"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                )}
                            </div>
                        )
                    })
                )}
                <div ref={bottomRef} />
            </div>

            {/* Input Submission Footer Form */}
            <form onSubmit={handleSend} className="p-4 border-t border-gray-50 bg-white">
                {/* Pending attachment previews (before sending) */}
                {(attachments.length > 0 || uploading) && (
                    <div className="flex flex-wrap items-center gap-3 mb-3">
                        {attachments.map((url, i) => (
                            <FilePreview key={i} url={url} size={56} onDelete={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))} />
                        ))}
                        {uploading && <span className="inline-flex items-center gap-1.5 text-[11px] text-gray-400"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading…</span>}
                    </div>
                )}
                <div className="flex flex-col sm:flex-row gap-3">
                    {/* Category Selection Dropdown */}
                    <div className="relative shrink-0 w-full sm:w-44">
                        <select
                            value={category}
                            onChange={(e) => setCategory(e.target.value)}
                            disabled={sending}
                            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50/50 font-sans text-xs font-bold text-gray-700 outline-none focus:border-emerald-500 transition-all cursor-pointer"
                        >
                            {CATEGORIES.map((cat) => (
                                <option key={cat} value={cat}>
                                    {cat}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Message Text Input + mention dropdown + attach */}
                    <div className="flex-1 flex gap-2">
                        <div className="relative flex-1">
                            {/* @mention dropdown */}
                            {mentionOpen && filteredMentions.length > 0 && (
                                <div className="absolute bottom-full left-0 mb-2 w-64 max-h-56 overflow-y-auto rounded-xl bg-white shadow-2xl border border-gray-100 z-50">
                                    <p className="px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider text-gray-400 border-b border-gray-50">Mention someone</p>
                                    {filteredMentions.map((u) => (
                                        <button
                                            key={u.uid}
                                            type="button"
                                            onClick={() => pickMention(u.name)}
                                            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-emerald-50 transition-colors text-left"
                                        >
                                            <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-[10px]">{(u.name[0] || "?").toUpperCase()}</span>
                                            <span className="flex-1 min-w-0">
                                                <span className="block font-sans text-xs font-semibold text-[#052210] truncate">{u.name}</span>
                                                <span className="block font-sans text-[9px] text-gray-400 uppercase tracking-wide">{formatRoleLabel(u.role)}</span>
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            )}
                            <input
                                ref={inputRef}
                                type="text"
                                value={message}
                                onChange={handleMessageChange}
                                placeholder="Type a note…  use @ to mention"
                                disabled={sending}
                                className="w-full pl-4 pr-9 py-2.5 rounded-xl border border-gray-200 bg-gray-50/50 font-sans text-xs outline-none focus:border-emerald-500 transition-all text-[#052210] font-medium"
                            />
                            <AtSign className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-300" />
                        </div>

                        {/* Attach button */}
                        <input ref={fileInputRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.gif" className="hidden" onChange={(e) => handleAttach(e.target.files)} />
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={sending || uploading}
                            title="Attach file"
                            className="px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50/50 text-gray-500 hover:text-emerald-600 hover:border-emerald-500 transition-all flex items-center justify-center"
                        >
                            <Paperclip className="w-4 h-4" />
                        </button>

                        <button
                            type="submit"
                            disabled={(!message.trim() && attachments.length === 0) || sending || uploading}
                            className={`px-4 py-2.5 rounded-xl text-white font-sans text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all ${
                                (!message.trim() && attachments.length === 0) || sending || uploading
                                    ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                                    : "bg-[#06a15c] hover:scale-105 active:scale-95 shadow-md shadow-emerald-500/10"
                            }`}
                        >
                            <Send className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Send</span>
                        </button>
                    </div>
                </div>
            </form>
        </div>
    )
}
