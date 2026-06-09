"use client"

import { ProtectedRoute } from "@/components/protected-route"
import { useEffect, useState } from "react"
import { getSOPs, createSOP, updateSOP, deleteSOP } from "@/lib/firestore"
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd"
import { GripHorizontal, GripVertical, Plus, Trash2, Edit3, X, Save, MessageSquare, ClipboardList, ChevronDown, ChevronRight, FileUp, CheckSquare, Type, Calendar, Link2, List, Star, FileText, FolderPlus, Folder } from "lucide-react"
import { StatusDialog } from "@/components/ui/StatusDialog"

const departments = [
    { id: "sales", label: "Sales", color: "#06a15c" },
    { id: "pre_ops", label: "Pre-Operations", color: "#3b82f6" },
    { id: "post_ops", label: "Post-Operations", color: "#f59e0b" },
]

// Post-Ops SOPs are shown on a booking based on the trip's current stage.
// "all" means the SOP shows in every stage (also the safe default for untagged SOPs).
const postOpsStages = [
    { id: "pre-arrival", label: "Pre-Arrival" },
    { id: "on-tour", label: "On Tour" },
    { id: "trip-ending", label: "Trip Ending" },
    { id: "feedback-closure", label: "Feedback & Closure" },
    { id: "all", label: "All Stages" },
]

const stepTypes = [
    { id: "checkbox", label: "Checkbox Check", icon: CheckSquare },
    { id: "file_upload", label: "File Upload", icon: FileUp },
    { id: "text_input", label: "Text Input", icon: Type },
    { id: "file_or_text", label: "Upload or Enter Text", icon: FileText },
    { id: "date_picker", label: "Date Picker", icon: Calendar },
    { id: "multiple_choice", label: "Multiple Choice", icon: List },
    { id: "multiple_select", label: "Multiple Select", icon: List },
    { id: "rating_5", label: "1-5 Star Rating", icon: Star },
    { id: "rating_10", label: "1-10 Star Rating", icon: Star },
]

interface SOPItem {
    id: string
    title: string
    type: string
    isRequired: boolean
    dependsOn?: string
    notes?: string
    points?: string[]
    extraInfo?: string
    requiresAcknowledgement?: boolean
    options?: string[]
    // Dynamic category support (Sales SOPs). Holds the id of the SOP category this
    // item belongs to. Optional/backward-compatible: untagged items fall back to "General".
    category?: string
}

// ─── Dynamic Categories (Sales SOP templates) ──────────────────────────────
// Categories are user-defined per SOP template and stored as an ordered array on
// the SOP doc: `categories: { id, name }[]`. Each item references its category via
// `item.category` (the category id). This is additive and only used by the Sales
// builder + Sales runtime grouping; Stage logic and other departments are untouched.
interface SOPCategory {
    id: string
    name: string
}

// Reserved id/name for items that have no explicit category (auto-migration target).
const GENERAL_CATEGORY_ID = "general"
const GENERAL_CATEGORY_NAME = "General"

const newCategory = (name = ""): SOPCategory => ({ id: crypto.randomUUID(), name })

const newItem = (category?: string): SOPItem => ({
    id: crypto.randomUUID(),
    title: "",
    type: "checkbox",
    isRequired: true,
    dependsOn: "",
    notes: "",
    points: [],
    extraInfo: "",
    requiresAcknowledgement: false,
    ...(category ? { category } : {}),
})

const typeLabel = (t: string) => stepTypes.find(s => s.id === t)?.label || t.replace(/_/g, ' ').toUpperCase()

// Group a SOP's items under its categories for display/editing. Synthesizes a
// "General" category when items exist with no (valid) category, so existing
// templates keep working with zero data migration and nothing is ever lost.
function buildCategoryGroups(sop: any): { categories: SOPCategory[]; itemsByCat: Record<string, any[]> } {
    const rawCats: SOPCategory[] = Array.isArray(sop?.categories) ? [...sop.categories] : []
    const items: any[] = Array.isArray(sop?.items) ? sop.items : []
    const validId = (cid: any) => !!cid && rawCats.some(c => c.id === cid)
    const hasUncategorized = items.some(it => !validId((it as any)?.category))

    let categories = rawCats
    if (hasUncategorized && !categories.some(c => c.id === GENERAL_CATEGORY_ID)) {
        categories = [...categories, { id: GENERAL_CATEGORY_ID, name: GENERAL_CATEGORY_NAME }]
    }

    const itemsByCat: Record<string, any[]> = {}
    categories.forEach(c => { itemsByCat[c.id] = [] })
    items.forEach(it => {
        const cid = validId((it as any)?.category) ? (it as any).category : GENERAL_CATEGORY_ID
        if (!itemsByCat[cid]) itemsByCat[cid] = []
        itemsByCat[cid].push(it)
    })
    return { categories, itemsByCat }
}

// Flatten grouped items back into a single ordered items array, stamping each
// item with its owning category id. Order follows category order, then in-category order.
function flattenByCategory(categories: SOPCategory[], itemsByCat: Record<string, any[]>): any[] {
    const out: any[] = []
    categories.forEach(c => {
        (itemsByCat[c.id] || []).forEach(it => out.push({ ...it, category: c.id }))
    })
    return out
}

export default function SOPsPage() {
    return (
        <ProtectedRoute allowedRoles={["admin"]}>
            <SOPsContent />
        </ProtectedRoute>
    )
}

function SOPsContent() {
    const [sops, setSOPs] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [activeDept, setActiveDept] = useState("sales")
    const [showModal, setShowModal] = useState(false)
    const [editSOP, setEditSOP] = useState<any>(null)
    const [formTitle, setFormTitle] = useState("")
    const [formItems, setFormItems] = useState<SOPItem[]>([newItem()])
    const [formWhatsapp, setFormWhatsapp] = useState("")
    const [formStage, setFormStage] = useState("all")
    const [formCategories, setFormCategories] = useState<SOPCategory[]>([])
    // Collapse/expand state for category sections in the list view, keyed by `${sopId}::${catId}`.
    const [collapsedCats, setCollapsedCats] = useState<Record<string, boolean>>({})
    const [isMounted, setIsMounted] = useState(false)
    const [editingItemId, setEditingItemId] = useState<string | null>(null)
    const [stepEditForm, setStepEditForm] = useState<SOPItem | null>(null)
    const [newPoint, setNewPoint] = useState("")
    
    // Dialog states
    const [dialogOpen, setDialogOpen] = useState(false)
    const [dialogType, setDialogType] = useState<"success" | "error" | "warning">("success")
    const [dialogTitle, setDialogTitle] = useState("")
    const [dialogMessage, setDialogMessage] = useState("")

    const showStatus = (type: "success" | "error" | "warning", title: string, message: string) => {
        setDialogType(type)
        setDialogTitle(title)
        setDialogMessage(message)
        setDialogOpen(true)
    }

    useEffect(() => { setIsMounted(true) }, [])

    useEffect(() => { loadSOPs() }, [])
    const loadSOPs = async () => {
        try {
            const loaded = await getSOPs()
            // Backfill stable ids for any object items missing one, so list-view
            // draggableIds/keys are unique even with malformed/legacy data. Assigned
            // once on load (not per-render) so ids stay stable across renders.
            const normalized = loaded.map((s: any) => Array.isArray(s.items)
                ? { ...s, items: s.items.map((it: any) => (it && typeof it === 'object' && !it.id) ? { ...it, id: crypto.randomUUID() } : it) }
                : s)
            setSOPs(normalized)
        } catch (e) { console.error(e) }
        finally { setLoading(false) }
    }

    const filtered = sops.filter(s => s.department === activeDept)

    const openNew = () => {
        setEditSOP(null)
        setFormTitle("")
        const isSales = activeDept === "sales"
        const initialCats: SOPCategory[] = isSales ? [{ id: GENERAL_CATEGORY_ID, name: GENERAL_CATEGORY_NAME }] : []
        setFormCategories(initialCats)
        setFormItems([newItem(isSales ? initialCats[0]?.id : undefined)])
        setFormWhatsapp("")
        setFormStage("all")
        setShowModal(true)
    }

    const openEdit = (sop: any) => {
        setEditSOP(sop)
        setFormTitle(sop.title || "")
        setFormWhatsapp(sop.whatsappTemplate || "")
        setFormStage(sop.stage || "all")

        const isSales = sop.department === "sales"
        // For Sales, resolve the SOP's categories (synthesizing "General" for legacy/untagged items).
        const { categories } = buildCategoryGroups(sop)
        let cats: SOPCategory[] = isSales ? categories : []
        if (isSales && cats.length === 0) cats = [{ id: GENERAL_CATEGORY_ID, name: GENERAL_CATEGORY_NAME }]
        const validIds = new Set(cats.map(c => c.id))

        // Convert items — handle both old string format and new object format
        const items = (sop.items || []).map((i: any) => {
            if (typeof i === 'string') return { ...newItem(isSales ? GENERAL_CATEGORY_ID : undefined), title: i }
            const category = isSales
                ? ((i.category && validIds.has(i.category)) ? i.category : GENERAL_CATEGORY_ID)
                : (i.category || '')
            return {
                id: i.id || crypto.randomUUID(),
                title: i.title || '',
                type: i.type || 'checkbox',
                isRequired: i.isRequired !== false,
                requiresAcknowledgement: i.requiresAcknowledgement || false,
                dependsOn: i.dependsOn || '',
                notes: i.notes || '',
                points: i.points || [],
                extraInfo: i.extraInfo || '',
                options: i.options || [],
                category,
            }
        })
        setFormCategories(cats)
        setFormItems(items.length ? items : [newItem(isSales ? cats[0]?.id : undefined)])
        setShowModal(true)
    }

    
    const onDragEnd = (result: any) => {
        if (!result.destination) return;
        const newItems = Array.from(formItems);
        const [movedItem] = newItems.splice(result.source.index, 1);
        newItems.splice(result.destination.index, 0, movedItem);
        setFormItems(newItems);
    }
    
    const addFormItem = () => setFormItems(f => [...f, newItem()])
    const updateFormItem = (idx: number, updates: Partial<SOPItem>) =>
        setFormItems(f => f.map((item, j) => j === idx ? { ...item, ...updates } : item))
    const removeFormItem = (idx: number) =>
        setFormItems(f => f.length > 1 ? f.filter((_, j) => j !== idx) : f)

    
    // Apply a patch to a SOP optimistically in local state, then persist to Firestore.
    const persistSop = async (sopId: string, patch: any) => {
        setSOPs(prev => prev.map(s => s.id === sopId ? { ...s, ...patch } : s))
        try {
            await updateSOP(sopId, patch)
        } catch (e) {
            console.error(e)
            showStatus("error", "Error", "Failed to save changes")
        }
    }

    // Build an items patch. For Sales SOPs it also normalizes categories and reorders
    // items into category order so the stored layout matches what the runtime renders.
    const buildItemsPatch = (sop: any, items: any[]) => {
        if (sop?.department !== "sales") return { items }
        const { categories, itemsByCat } = buildCategoryGroups({ ...sop, items })
        return { categories, items: flattenByCategory(categories, itemsByCat) }
    }

    const onListDragEnd = async (result: any) => {
        if (!result.destination) return;
        const { source, destination, type } = result;

        const sopId = source.droppableId.split('||')[0];
        // Never allow moves across different SOP cards.
        if (destination.droppableId.split('||')[0] !== sopId) return;
        const sop = sops.find(s => s.id === sopId);
        if (!sop) return;

        // 1) Reordering category headers (Sales only).
        if (type === "category") {
            const { categories, itemsByCat } = buildCategoryGroups(sop);
            const cats = Array.from(categories);
            const [moved] = cats.splice(source.index, 1);
            cats.splice(destination.index, 0, moved);
            await persistSop(sopId, { categories: cats, items: flattenByCategory(cats, itemsByCat) });
            return;
        }

        const srcParts = source.droppableId.split('||');
        const destParts = destination.droppableId.split('||');

        // 2) Legacy flat list (non-sales): droppableId === `${sopId}||items`.
        if (srcParts[1] === 'items') {
            const newItems = Array.from(sop.items || []);
            const [movedItem] = newItems.splice(source.index, 1);
            newItems.splice(destination.index, 0, movedItem);
            await persistSop(sopId, { items: newItems });
            return;
        }

        // 3) Sales grouped lists: droppableId === `${sopId}||cat||${catId}` — reorder
        //    within a category, or move an item across categories.
        const srcCatId = srcParts[2];
        const destCatId = destParts[2];
        const { categories, itemsByCat } = buildCategoryGroups(sop);
        // Guard against stale droppables (e.g. a category deleted between render and drop):
        // an unknown destination would orphan the item on flatten and lose it.
        if (!categories.some(c => c.id === srcCatId) || !categories.some(c => c.id === destCatId)) return;
        const srcList = Array.from(itemsByCat[srcCatId] || []);
        const [movedItem] = srcList.splice(source.index, 1);
        if (!movedItem) return;
        if (srcCatId === destCatId) {
            srcList.splice(destination.index, 0, movedItem);
            itemsByCat[srcCatId] = srcList;
        } else {
            const destList = Array.from(itemsByCat[destCatId] || []);
            destList.splice(destination.index, 0, { ...movedItem, category: destCatId });
            itemsByCat[srcCatId] = srcList;
            itemsByCat[destCatId] = destList;
        }
        await persistSop(sopId, { categories, items: flattenByCategory(categories, itemsByCat) });
    }

    // ─── Sales category management (list view) ──────────────────────────
    const toggleCatCollapse = (sopId: string, catId: string) => {
        const key = `${sopId}::${catId}`;
        setCollapsedCats(prev => ({ ...prev, [key]: !prev[key] }));
    }

    const addCategoryToSop = async (sop: any) => {
        const { categories, itemsByCat } = buildCategoryGroups(sop);
        const cats = [...categories, newCategory("New Category")];
        await persistSop(sop.id, { categories: cats, items: flattenByCategory(cats, itemsByCat) });
    }

    const renameCategoryLocal = (sopId: string, catId: string, name: string) => {
        setSOPs(prev => prev.map(s => {
            if (s.id !== sopId) return s;
            const { categories } = buildCategoryGroups(s);
            return { ...s, categories: categories.map(c => c.id === catId ? { ...c, name } : c) };
        }));
    }

    const persistCategoryName = async (sopId: string) => {
        const sop = sops.find(s => s.id === sopId);
        if (!sop) return;
        const { categories, itemsByCat } = buildCategoryGroups(sop);
        // Drop a now-blank name back to a safe default so runtime grouping stays valid.
        const cats = categories.map(c => ({ id: c.id, name: (c.name || '').trim() || GENERAL_CATEGORY_NAME }));
        await persistSop(sopId, { categories: cats, items: flattenByCategory(cats, itemsByCat) });
    }

    const deleteCategoryFromSop = async (sop: any, catId: string) => {
        const { categories, itemsByCat } = buildCategoryGroups(sop);
        if (categories.length <= 1) {
            showStatus("warning", "Cannot Delete", "A template must keep at least one category.");
            return;
        }
        const itemsInCat = itemsByCat[catId] || [];
        const remaining = categories.filter(c => c.id !== catId);
        const target = remaining[0];
        if (itemsInCat.length > 0 && !confirm(`Delete this category? Its ${itemsInCat.length} item(s) will move to "${target.name}".`)) return;
        const newByCat: Record<string, any[]> = { ...itemsByCat };
        newByCat[target.id] = [...(newByCat[target.id] || []), ...itemsInCat];
        delete newByCat[catId];
        await persistSop(sop.id, { categories: remaining, items: flattenByCategory(remaining, newByCat) });
    }

    const addItemToCategory = async (sop: any, catId: string) => {
        const id = crypto.randomUUID();
        const item: any = { id, title: "", type: "checkbox", isRequired: true, notes: "", points: [], dependsOn: "", category: catId };
        const { categories, itemsByCat } = buildCategoryGroups(sop);
        const newByCat = { ...itemsByCat, [catId]: [...(itemsByCat[catId] || []), item] };
        await persistSop(sop.id, { categories, items: flattenByCategory(categories, newByCat) });
        setEditingItemId(`${sop.id}-${id}`);
        setStepEditForm(item);
    }

    const handleSave = async () => {
        if (!formTitle.trim()) {
            showStatus("error", "Title Required", "Please enter a title for this SOP Template")
            return
        }

        const isSales = activeDept === "sales"

        // Sanitize categories (Sales only): trim names, drop blank ones, guarantee at least "General".
        let cats: SOPCategory[] = []
        if (isSales) {
            cats = formCategories.map(c => ({ id: c.id, name: (c.name || '').trim() })).filter(c => c.name.length > 0)
            if (cats.length === 0) cats = [{ id: GENERAL_CATEGORY_ID, name: GENERAL_CATEGORY_NAME }]
        }
        const fallbackCatId = cats[0]?.id || GENERAL_CATEGORY_ID

        let items = formItems.filter(i => i.title.trim()).map(i => ({
            id: i.id,
            title: i.title.trim(),
            type: i.type,
            isRequired: i.isRequired,
            requiresAcknowledgement: i.requiresAcknowledgement || false,
            ...(i.dependsOn ? { dependsOn: i.dependsOn } : {}),
            notes: i.notes || '',
            points: i.points || [],
            extraInfo: i.extraInfo || '',
            ...(i.options ? { options: i.options } : {}),
            // Assign each Sales item to a valid category (orphans → first category).
            ...(isSales ? { category: cats.some(c => c.id === i.category) ? i.category : fallbackCatId } : {}),
        }))

        if (items.length === 0) {
            showStatus("error", "Steps Required", "Please add at least one process step with a title")
            return
        }

        // Sales: persist items grouped/ordered by category so order reflects the category layout.
        let categoriesPatch: any = {}
        if (isSales) {
            const byCat: Record<string, any[]> = {}
            cats.forEach(c => { byCat[c.id] = [] })
            items.forEach(it => { (byCat[(it as any).category] || (byCat[fallbackCatId])).push(it) })
            items = cats.flatMap(c => byCat[c.id] || [])
            categoriesPatch = { categories: cats }
        }

        // Trip-stage tagging only applies to Post-Ops SOPs
        const stagePatch = activeDept === "post_ops" ? { stage: formStage } : {}

        try {
            if (editSOP) {
                await updateSOP(editSOP.id, { title: formTitle, items, whatsappTemplate: formWhatsapp, ...stagePatch, ...categoriesPatch })
                showStatus("success", "Updated", "SOP Template updated successfully")
            } else {
                await createSOP({ title: formTitle, department: activeDept, items, whatsappTemplate: formWhatsapp, ...stagePatch, ...categoriesPatch })
                showStatus("success", "Created", "New SOP Template created successfully")
            }
            setShowModal(false)
            loadSOPs()
        } catch (e) { 
            console.error(e)
            showStatus("error", "Error", "Failed to save SOP template")
        }
    }

    const handleDelete = async (id: string) => {
        showStatus("warning", "Confirm Delete", "Are you sure you want to delete this SOP? This cannot be undone.")
        if (!confirm("Delete this SOP?")) return
        try { 
            await deleteSOP(id); 
            loadSOPs() 
            showStatus("success", "Deleted", "SOP Template deleted successfully")
        } catch (e) { 
            console.error(e)
            showStatus("error", "Error", "Failed to delete SOP template")
        }
    }

    const startEditingItem = (sopId: string, item: SOPItem) => {
        setEditingItemId(`${sopId}-${item.id}`)
        setStepEditForm({ ...item })
    }

    const saveStepInline = async (sopId: string) => {
        if (!stepEditForm) return
        const sop = sops.find(s => s.id === sopId)
        if (!sop) return

        const newItems = (sop.items || []).map((i: any) => i.id === stepEditForm.id ? stepEditForm : i)
        const patch = buildItemsPatch(sop, newItems)

        try {
            await updateSOP(sopId, patch)
            setSOPs(prev => prev.map(s => s.id === sopId ? { ...s, ...patch } : s))
            setEditingItemId(null)
            setStepEditForm(null)
            showStatus("success", "Saved", "Step changes saved successfully")
        } catch (e) {
            console.error(e)
            showStatus("error", "Error", "Failed to save step")
        }
    }

    const deleteStepInline = async (sopId: string, itemId: string) => {
        if (!confirm("Delete this step?")) return
        const sop = sops.find(s => s.id === sopId)
        if (!sop) return

        const newItems = (sop.items || []).filter((i: any) => i.id !== itemId)
        const patch = buildItemsPatch(sop, newItems)

        try {
            await updateSOP(sopId, patch)
            setSOPs(prev => prev.map(s => s.id === sopId ? { ...s, ...patch } : s))
            showStatus("success", "Deleted", "Step removed successfully")
        } catch (e) {
            console.error(e)
            showStatus("error", "Error", "Failed to remove step")
        }
    }

    const addNewStepInline = async (sopId: string) => {
        const sop = sops.find(s => s.id === sopId)
        if (!sop) return

        const newItemId = crypto.randomUUID()
        const newItem: SOPItem = {
            id: newItemId,
            title: "",
            type: "checkbox",
            isRequired: true,
            notes: "",
            points: [],
            dependsOn: ""
        }

        const newItems = [...(sop.items || []), newItem]
        // Route through buildItemsPatch so Sales SOPs keep categories normalized/ordered.
        const patch = buildItemsPatch(sop, newItems)

        try {
            await updateSOP(sopId, patch)
            setSOPs(prev => prev.map(s => s.id === sopId ? { ...s, ...patch } : s))
            setEditingItemId(`${sopId}-${newItemId}`)
            setStepEditForm(newItem)
        } catch (e) {
            console.error(e)
            showStatus("error", "Error", "Failed to add new step")
        }
    }

    const deptColor = departments.find(d => d.id === activeDept)?.color || "#06a15c"

    // Renders one checklist step in the list view — either the inline editor (when this
    // step is being edited) or the compact draggable row. Shared by the legacy flat layout
    // (non-sales) and the Sales category-grouped layout. `idx` is the index within the
    // enclosing Droppable.
    const renderStep = (sop: any, item: any, idx: number) => {
        const isObj = typeof item === 'object' && item !== null
        const title = isObj ? (item.title || '') : String(item)
        const type = isObj ? (item.type || 'checkbox') : 'checkbox'
        const isRequired = isObj ? item.isRequired !== false : true
        const isEditing = editingItemId === `${sop.id}-${item.id || idx}`

        if (isEditing && stepEditForm) {
            const sopCategories = sop.department === "sales" ? buildCategoryGroups(sop).categories : []
            return (
                <div key={`${sop.id}-${item.id || idx}`} className="p-8 rounded-[32px] border border-emerald-100 bg-white shadow-xl space-y-6 my-4">
                    {/* Edit Header */}
                    <div className="flex items-center gap-4">
                        <input
                            value={stepEditForm.title}
                            onChange={e => setStepEditForm({ ...stepEditForm, title: e.target.value })}
                            className="flex-1 px-5 py-3.5 rounded-2xl border border-gray-100 text-lg font-bold focus:outline-none focus:border-emerald-500"
                            placeholder="Step Title"
                        />
                        <div className="relative w-64">
                            <select
                                value={stepEditForm.type}
                                onChange={e => setStepEditForm({ ...stepEditForm, type: e.target.value })}
                                className="w-full pl-5 pr-10 py-3.5 rounded-2xl border border-gray-100 text-sm font-medium appearance-none focus:outline-none focus:border-emerald-500 bg-white"
                            >
                                {stepTypes.map(t => (
                                    <option key={t.id} value={t.id}>{t.label}</option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                        </div>
                        <button onClick={() => deleteStepInline(sop.id, item.id)} className="p-3 text-gray-300 hover:text-red-500 transition-colors">
                            <Trash2 className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Category — Sales only (move item between categories) */}
                    {sop.department === "sales" && (
                        <div>
                            <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Category</label>
                            <select
                                value={(stepEditForm.category && sopCategories.some(c => c.id === stepEditForm.category)) ? stepEditForm.category : (sopCategories[0]?.id || "")}
                                onChange={e => setStepEditForm({ ...stepEditForm, category: e.target.value })}
                                className="w-full px-5 py-3.5 rounded-2xl border border-gray-100 text-sm font-medium focus:outline-none focus:border-emerald-500 bg-gray-50/50 appearance-none"
                            >
                                {sopCategories.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Dependency */}
                    <div>
                        <select
                            value={stepEditForm.dependsOn || ""}
                            onChange={e => setStepEditForm({ ...stepEditForm, dependsOn: e.target.value })}
                            className="w-full px-5 py-3.5 rounded-2xl border border-gray-100 text-sm font-medium focus:outline-none focus:border-emerald-500 bg-gray-50/50 text-gray-500 appearance-none"
                        >
                            <option value="">No dependency</option>
                            {sop.items.filter((i: any) => i.id !== item.id).map((i: any) => (
                                <option key={i.id} value={i.id}>{i.title}</option>
                            ))}
                        </select>
                    </div>

                    {/* Notes */}
                    <div>
                        <textarea
                            value={stepEditForm.notes || ""}
                            onChange={e => setStepEditForm({ ...stepEditForm, notes: e.target.value })}
                            className="w-full px-5 py-3.5 rounded-2xl border border-gray-100 text-sm focus:outline-none focus:border-emerald-500 min-h-[60px]"
                            placeholder="Notes / Instructions"
                        />
                    </div>

                    {/* Sub-tasks */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400">Key Points / Sub-tasks</h4>
                            <button
                                onClick={() => {
                                    if (newPoint.trim()) {
                                        setStepEditForm({ ...stepEditForm, points: [...(stepEditForm.points || []), newPoint.trim()] })
                                        setNewPoint("")
                                    }
                                }}
                                className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-emerald-600 hover:opacity-70 transition-all"
                            >
                                <Plus className="w-3 h-3" /> Add Point
                            </button>
                        </div>
                        <div className="space-y-3">
                            <input
                                value={newPoint}
                                onChange={e => setNewPoint(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === "Enter" && newPoint.trim()) {
                                        e.preventDefault()
                                        setStepEditForm({ ...stepEditForm, points: [...(stepEditForm.points || []), newPoint.trim()] })
                                        setNewPoint("")
                                    }
                                }}
                                className="w-full px-5 py-3.5 rounded-2xl border border-gray-100 text-sm italic focus:outline-none focus:border-emerald-500 bg-gray-50/50"
                                placeholder="Extra configuration or metadata (Optional)"
                            />
                            <div className="space-y-2">
                                {(stepEditForm.points || []).map((p, i) => (
                                    <div key={i} className="flex items-center gap-3 px-5 py-3 rounded-xl border border-gray-50 bg-white group/point">
                                        <span className="flex-1 text-sm font-medium text-gray-600">{p}</span>
                                        <button onClick={() => setStepEditForm({ ...stepEditForm, points: (stepEditForm.points || []).filter((_, k) => k !== i) })} className="text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover/point:opacity-100">
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Acknowledgement Toggle */}
                    <div className="p-5 rounded-2xl border border-gray-100 flex items-center justify-between bg-gray-50/30">
                        <div>
                            <p className="text-sm font-bold text-[#052210]">Require Acknowledgement</p>
                            <p className="text-[11px] text-gray-400 mt-0.5">User must explicitly tick "Yes, I have done this"</p>
                        </div>
                        <button
                            onClick={() => setStepEditForm({ ...stepEditForm, requiresAcknowledgement: !stepEditForm.requiresAcknowledgement })}
                            className={`w-12 h-6 rounded-full relative transition-all ${stepEditForm.requiresAcknowledgement ? 'bg-emerald-600' : 'bg-gray-200'}`}
                        >
                            <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${stepEditForm.requiresAcknowledgement ? 'left-7' : 'left-1'}`} />
                        </button>
                    </div>

                    {/* Options (for choice types) */}
                    {(stepEditForm.type === 'multiple_choice' || stepEditForm.type === 'multiple_select') && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400">Options</h4>
                                <button
                                    onClick={() => setStepEditForm({ ...stepEditForm, options: [...(stepEditForm.options || []), ""] })}
                                    className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-emerald-600 hover:opacity-70 transition-all"
                                >
                                    <Plus className="w-3 h-3" /> Add Option
                                </button>
                            </div>
                            <div className="space-y-2">
                                {(stepEditForm.options || []).map((o, i) => (
                                    <div key={i} className="flex gap-2 items-center">
                                        <input
                                            value={o}
                                            onChange={e => {
                                                const newOpts = [...(stepEditForm.options || [])]
                                                newOpts[i] = e.target.value
                                                setStepEditForm({ ...stepEditForm, options: newOpts })
                                            }}
                                            className="flex-1 px-4 py-2.5 rounded-xl border border-gray-100 text-xs focus:outline-none focus:border-emerald-500"
                                            placeholder={`Option ${i + 1}`}
                                        />
                                        <button onClick={() => setStepEditForm({ ...stepEditForm, options: (stepEditForm.options || []).filter((_, k) => k !== i) })} className="text-gray-300 hover:text-red-500">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Footer */}
                    <div className="flex items-center justify-between pt-4">
                        <div className="flex gap-0.5 p-1 rounded-xl bg-gray-100 w-fit">
                            <button
                                onClick={() => setStepEditForm({ ...stepEditForm, isRequired: true })}
                                className={`px-6 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${stepEditForm.isRequired ? 'bg-[#052210] text-white' : 'text-gray-400'}`}
                            >Mandatory</button>
                            <button
                                onClick={() => setStepEditForm({ ...stepEditForm, isRequired: false })}
                                className={`px-6 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${!stepEditForm.isRequired ? 'bg-[#052210] text-white' : 'text-gray-400'}`}
                            >Optional</button>
                        </div>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => saveStepInline(sop.id)}
                                className="px-10 py-3 rounded-2xl bg-emerald-600 text-white text-sm font-bold uppercase tracking-wider hover:opacity-90 transition-all shadow-lg shadow-emerald-100"
                            >Save</button>
                            <button onClick={() => setEditingItemId(null)} className="px-6 py-3 text-xs font-bold uppercase tracking-wider text-gray-400">Cancel</button>
                        </div>
                    </div>
                </div>
            )
        }

        return (
            <Draggable key={`${sop.id}-${item.id || idx}`} draggableId={`${sop.id}||${item.id || idx}`} index={idx}>
                {(provided) => (
                    <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        className="flex items-center gap-3 py-4 px-6 rounded-2xl transition-all group"
                        style={{ background: 'rgba(5,34,16,0.02)', ...provided.draggableProps.style }}>
                        <div {...provided.dragHandleProps} className="text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing">
                            <GripVertical className="w-5 h-5" />
                        </div>
                        <div className="w-5 h-5 rounded-lg border-2 flex-shrink-0" style={{ borderColor: 'rgba(5,34,16,0.1)' }} />
                        <div className="flex-1 min-w-0">
                            <div className="flex flex-col gap-1">
                                <span className="font-sans text-base font-bold" style={{ color: '#052210' }}>{title}</span>
                                <div className="flex items-center gap-2">
                                    <span className="font-sans text-[9px] font-black tracking-wider uppercase px-2 py-0.5 rounded bg-white text-gray-400 border border-gray-100">
                                        {typeLabel(type)}
                                    </span>
                                    {!isRequired && (
                                        <span className="font-sans text-[9px] font-bold tracking-wider uppercase text-orange-400">Optional</span>
                                    )}
                                </div>
                            </div>

                            {(item.notes || (item.points && item.points.length > 0)) && (
                                <div className="mt-3 space-y-2 border-l-2 border-gray-100 pl-4 italic">
                                    {item.notes && <p className="font-sans text-xs" style={{ color: 'rgba(5,34,16,0.5)' }}>{item.notes}</p>}
                                    {item.points && item.points.length > 0 && (
                                        <div className="space-y-1">
                                            {item.points.map((p: string, k: number) => (
                                                <div key={k} className="flex items-center gap-2 text-[11px]" style={{ color: 'rgba(5,34,16,0.5)' }}>
                                                    <div className="w-1 h-1 rounded-full bg-gray-300" />
                                                    <span>{p}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Step Actions */}
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                                onClick={() => startEditingItem(sop.id, item)}
                                className="p-2 rounded-lg border border-gray-100 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition-all"
                            >
                                <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => deleteStepInline(sop.id, item.id)}
                                className="p-2 rounded-lg border border-gray-100 text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                )}
            </Draggable>
        )
    }

    return (
        <div className="space-y-6 max-w-5xl">
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                    <h1 className="font-serif text-3xl tracking-wide" style={{ color: '#052210' }}>SOP Templates</h1>
                    <p className="font-sans text-sm mt-1" style={{ color: 'rgba(5,34,16,0.5)' }}>Create advanced checklists for each department</p>
                </div>
                <button onClick={openNew} className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-sans text-xs font-bold tracking-wider uppercase transition-all hover:scale-105" style={{ background: '#052210', color: '#fff' }}>
                    <Plus className="w-3.5 h-3.5" /> New SOP
                </button>
            </div>

            {/* Department Tabs */}
            <div className="flex rounded-xl overflow-hidden" style={{ border: '1px solid rgba(5,34,16,0.1)' }}>
                {departments.map(d => (
                    <button key={d.id} onClick={() => setActiveDept(d.id)}
                        className="flex-1 px-4 py-3 font-sans text-xs tracking-wider uppercase font-semibold transition-all"
                        style={{ background: activeDept === d.id ? d.color : 'transparent', color: activeDept === d.id ? '#fff' : 'rgba(5,34,16,0.5)' }}>
                        {d.label}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: deptColor, borderTopColor: 'transparent' }} /></div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-16 rounded-2xl" style={{ background: '#FFFFFF', border: '1px solid rgba(5,34,16,0.06)' }}>
                    <ClipboardList className="w-10 h-10 mx-auto mb-3" style={{ color: 'rgba(5,34,16,0.15)' }} />
                    <p className="font-sans text-sm" style={{ color: 'rgba(5,34,16,0.4)' }}>No SOPs for this department yet</p>
                </div>
            ) : (
                isMounted ? (
                <DragDropContext onDragEnd={onListDragEnd}>
                <div className="space-y-4">
                    {filtered.map((sop: any) => (
                        <div key={sop.id} className="rounded-2xl p-6" style={{ background: '#FFFFFF', border: '1px solid rgba(5,34,16,0.06)', boxShadow: '0 2px 12px rgba(0,0,0,0.03)' }}>
                            <div className="flex items-center justify-between mb-8 pb-4 border-b border-gray-100">
                                <div>
                                    <h3 className="text-2xl font-bold text-[#052210]">{sop.title}</h3>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600">
                                            {sop.items?.length || 0} {sop.items?.length === 1 ? 'CHECKLIST ITEM' : 'CHECKLIST ITEMS'}
                                        </span>
                                        {activeDept === "post_ops" && (
                                            <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-amber-50 text-amber-600 border border-amber-100">
                                                {postOpsStages.find(s => s.id === (sop.stage || "all"))?.label || "All Stages"}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button onClick={() => openEdit(sop)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:text-emerald-600 hover:border-emerald-200 hover:bg-emerald-50 transition-all font-sans text-xs font-bold uppercase tracking-wider">
                                        <Edit3 className="w-3.5 h-3.5" /> Edit
                                    </button>
                                    <button onClick={() => handleDelete(sop.id)} className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors">
                                        <Trash2 className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>
                            {sop.department === "sales" ? (() => {
                                // Sales SOPs: items grouped under user-defined, reorderable,
                                // collapsible categories. "General" is synthesized for legacy/untagged items.
                                const { categories, itemsByCat } = buildCategoryGroups(sop)
                                return (
                                <div>
                                    <Droppable droppableId={`${sop.id}||categories`} type="category">
                                        {(catsProvided) => (
                                            <div ref={catsProvided.innerRef} {...catsProvided.droppableProps} className="space-y-4">
                                                {categories.map((cat, catIdx) => {
                                                    const catKey = `${sop.id}::${cat.id}`
                                                    const collapsed = !!collapsedCats[catKey]
                                                    const catItems = itemsByCat[cat.id] || []
                                                    return (
                                                        <Draggable key={cat.id} draggableId={`${sop.id}||catdrag||${cat.id}`} index={catIdx}>
                                                            {(catProvided) => (
                                                                <div ref={catProvided.innerRef} {...catProvided.draggableProps} className="rounded-2xl border border-gray-100 bg-gray-50/40" style={{ ...catProvided.draggableProps.style }}>
                                                                    {/* Category Header */}
                                                                    <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
                                                                        <div {...catProvided.dragHandleProps} className="text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing">
                                                                            <GripVertical className="w-4 h-4" />
                                                                        </div>
                                                                        <button onClick={() => toggleCatCollapse(sop.id, cat.id)} className="text-gray-400 hover:text-emerald-600 transition-colors">
                                                                            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                                                        </button>
                                                                        <Folder className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                                                                        <input
                                                                            value={cat.name}
                                                                            onChange={e => renameCategoryLocal(sop.id, cat.id, e.target.value)}
                                                                            onBlur={() => persistCategoryName(sop.id)}
                                                                            className="flex-1 min-w-0 bg-transparent font-bold text-sm text-[#052210] focus:outline-none focus:bg-white rounded px-2 py-1"
                                                                            placeholder="Category name"
                                                                        />
                                                                        <span className="text-[9px] font-black uppercase tracking-wider text-gray-400 flex-shrink-0">{catItems.length} {catItems.length === 1 ? 'item' : 'items'}</span>
                                                                        <button onClick={() => deleteCategoryFromSop(sop, cat.id)} className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0">
                                                                            <Trash2 className="w-4 h-4" />
                                                                        </button>
                                                                    </div>
                                                                    {/* Category Items */}
                                                                    {!collapsed && (
                                                                        <Droppable droppableId={`${sop.id}||cat||${cat.id}`} type="item">
                                                                            {(itemsProvided) => (
                                                                                <div ref={itemsProvided.innerRef} {...itemsProvided.droppableProps} className="space-y-2 p-3">
                                                                                    {catItems.map((item: any, idx: number) => renderStep(sop, item, idx))}
                                                                                    {itemsProvided.placeholder}
                                                                                    <button onClick={() => addItemToCategory(sop, cat.id)} className="w-full py-3 rounded-xl border-2 border-dashed border-gray-100 text-gray-400 hover:border-emerald-200 hover:text-emerald-600 hover:bg-emerald-50/30 transition-all flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wider">
                                                                                        <Plus className="w-3.5 h-3.5" /> Add Item
                                                                                    </button>
                                                                                </div>
                                                                            )}
                                                                        </Droppable>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </Draggable>
                                                    )
                                                })}
                                                {catsProvided.placeholder}
                                            </div>
                                        )}
                                    </Droppable>
                                    <button onClick={() => addCategoryToSop(sop)} className="mt-4 w-full py-3 rounded-2xl border-2 border-dashed border-emerald-200 text-emerald-600 hover:bg-emerald-50/40 transition-all flex items-center justify-center gap-2 text-sm font-bold uppercase tracking-wider">
                                        <FolderPlus className="w-4 h-4" /> Add Category
                                    </button>
                                </div>
                                )
                            })() : (
                            <Droppable droppableId={`${sop.id}||items`}>
                                {(provided) => (
                            <div className="space-y-2" ref={provided.innerRef} {...provided.droppableProps}>
                                {(sop.items || []).map((item: any, idx: number) => renderStep(sop, item, idx))}
                                {provided.placeholder}
                                
                                {/* Add Step Button */}
                                <button 
                                    onClick={() => addNewStepInline(sop.id)}
                                    className="w-full py-4 rounded-2xl border-2 border-dashed border-gray-100 text-gray-400 hover:border-emerald-200 hover:text-emerald-600 hover:bg-emerald-50/30 transition-all flex items-center justify-center gap-2 mt-4 group"
                                >
                                    <div className="w-6 h-6 rounded-lg bg-gray-50 flex items-center justify-center group-hover:bg-white group-hover:shadow-sm transition-all">
                                        <Plus className="w-4 h-4" />
                                    </div>
                                    <span className="text-sm font-bold uppercase tracking-wider">Add Process Step</span>
                                </button>
                            </div>
                            )}
                            </Droppable>
                            )}
                            {sop.whatsappTemplate && (
                                <div className="mt-4 p-3 rounded-lg" style={{ background: 'rgba(37,211,102,0.05)', border: '1px solid rgba(37,211,102,0.15)' }}>
                                    <div className="flex items-center gap-2 mb-1">
                                        <MessageSquare className="w-3 h-3" style={{ color: '#25D366' }} />
                                        <span className="font-sans text-[9px] font-bold tracking-wider uppercase" style={{ color: '#25D366' }}>WhatsApp Template</span>
                                    </div>
                                    <p className="font-sans text-xs whitespace-pre-wrap" style={{ color: 'rgba(5,34,16,0.6)' }}>{sop.whatsappTemplate}</p>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
                </DragDropContext>
                ) : null
            )}

            {/* Advanced Builder Modal */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
                    <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl p-6" style={{ background: '#FFFFFF' }}>
                        {/* Modal Header */}
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(5,34,16,0.06)' }}>
                                    <ClipboardList className="w-5 h-5" style={{ color: '#052210' }} />
                                </div>
                                <div>
                                    <h2 className="font-serif text-xl" style={{ color: '#052210' }}>{editSOP ? "Edit SOP" : "Create SOP"}</h2>
                                    <p className="font-sans text-[10px] tracking-wider uppercase" style={{ color: 'rgba(5,34,16,0.4)' }}>Advanced Builder</p>
                                </div>
                            </div>
                            <button onClick={() => setShowModal(false)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-50"><X className="w-4 h-4" /></button>
                        </div>

                        {/* SOP Title */}
                        <div className="mb-6">
                            <label className="font-sans text-[10px] font-bold tracking-wider uppercase block mb-1.5" style={{ color: 'rgba(5,34,16,0.5)' }}>SOP Template Title</label>
                            <input value={formTitle} onChange={e => setFormTitle(e.target.value)} className="w-full px-4 py-3 rounded-xl font-sans text-sm" placeholder="e.g. Sales Handover Checklist" style={{ border: '1px solid rgba(5,34,16,0.1)', outline: 'none' }} />
                        </div>

                        {/* Trip Stage — only for Post-Ops SOPs */}
                        {activeDept === "post_ops" && (
                            <div className="mb-6">
                                <label className="font-sans text-[10px] font-bold tracking-wider uppercase block mb-1.5" style={{ color: 'rgba(5,34,16,0.5)' }}>Show During Stage</label>
                                <select
                                    value={formStage}
                                    onChange={e => setFormStage(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl font-sans text-sm bg-white cursor-pointer"
                                    style={{ border: '1px solid rgba(5,34,16,0.1)', outline: 'none' }}
                                >
                                    {postOpsStages.map(s => (
                                        <option key={s.id} value={s.id}>{s.label}</option>
                                    ))}
                                </select>
                                <p className="font-sans text-[11px] text-gray-400 mt-1.5">
                                    This checklist appears on a booking only while the trip is in the selected stage. Choose <strong>All Stages</strong> to always show it.
                                </p>
                            </div>
                        )}

                        {/* Categories — Sales SOPs only */}
                        {activeDept === "sales" && (
                            <div className="mb-6">
                                <div className="flex items-center justify-between mb-2">
                                    <label className="font-sans text-[10px] font-bold tracking-wider uppercase" style={{ color: 'rgba(5,34,16,0.5)' }}>Categories</label>
                                    <button type="button" onClick={() => setFormCategories(cs => [...cs, newCategory("New Category")])} className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 hover:text-emerald-700 uppercase tracking-wider">
                                        <FolderPlus className="w-3 h-3" /> Add Category
                                    </button>
                                </div>
                                <div className="space-y-2">
                                    {formCategories.map((cat) => (
                                        <div key={cat.id} className="flex items-center gap-2">
                                            <Folder className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                                            <input
                                                value={cat.name}
                                                onChange={e => setFormCategories(cs => cs.map(c => c.id === cat.id ? { ...c, name: e.target.value } : c))}
                                                className="flex-1 px-3 py-2 rounded-lg font-sans text-xs"
                                                placeholder="Category name"
                                                style={{ border: '1px solid rgba(5,34,16,0.1)', outline: 'none' }}
                                            />
                                            <button
                                                type="button"
                                                disabled={formCategories.length <= 1}
                                                onClick={() => {
                                                    if (formCategories.length <= 1) return
                                                    const remaining = formCategories.filter(c => c.id !== cat.id)
                                                    const targetId = remaining[0].id
                                                    setFormCategories(remaining)
                                                    setFormItems(items => items.map(it => it.category === cat.id ? { ...it, category: targetId } : it))
                                                }}
                                                className="p-2 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                                <p className="font-sans text-[11px] text-gray-400 mt-1.5">
                                    Group checklist items into categories. Assign each step to a category below. Reorder categories and drag items between them from the saved template view.
                                </p>
                            </div>
                        )}

                        {/* Process Steps */}
                        <div className="mb-6">
                            <label className="font-sans text-[10px] font-bold tracking-wider uppercase block mb-3" style={{ color: 'rgba(5,34,16,0.5)' }}>Process Steps</label>
                            
                            {isMounted ? (
                                <DragDropContext onDragEnd={onDragEnd}>
                                    <Droppable droppableId="modal-process-steps">
                                        {(provided) => (
                                            <div className="space-y-3" {...provided.droppableProps} ref={provided.innerRef}>
                                                {formItems.map((item, idx) => (
                                                    <Draggable key={item.id} draggableId={item.id} index={idx}>
                                                        {(provided) => (
                                                            <div 
                                                                ref={provided.innerRef}
                                                                {...provided.draggableProps}
                                                                className="rounded-xl p-4 relative" 
                                                                style={{ 
                                                                    ...provided.draggableProps.style,
                                                                    border: '1px solid rgba(5,34,16,0.08)', 
                                                                    background: 'rgba(5,34,16,0.01)' 
                                                                }}
                                                            >
                                                                {/* Step title + type row */}
                                                                <div className="flex gap-2 mb-3">
                                                                    <div {...provided.dragHandleProps} className="flex items-center justify-center p-1 -ml-1 text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing">
                                                                        <GripVertical className="w-4 h-4" />
                                                                    </div>
                                                                    <input
                                                                        value={item.title}
                                                                        onChange={e => updateFormItem(idx, { title: e.target.value })}
                                                                        className="flex-1 px-4 py-2.5 rounded-xl font-sans text-sm bg-white"
                                                                        placeholder={`Step ${idx + 1} Question / Task`}
                                                                        style={{ border: '1px solid rgba(5,34,16,0.1)', outline: 'none' }}
                                                                    />
                                                                    <div className="relative">
                                                                        <select
                                                                            value={item.type}
                                                                            onChange={e => updateFormItem(idx, { type: e.target.value })}
                                                                            className="appearance-none pl-3 pr-8 py-2.5 rounded-xl font-sans text-xs font-medium cursor-pointer"
                                                                            style={{ border: '1px solid rgba(5,34,16,0.1)', outline: 'none', background: '#fff', color: '#052210' }}
                                                                        >
                                                                            {stepTypes.map(t => (
                                                                                <option key={t.id} value={t.id}>{t.label}</option>
                                                                            ))}
                                                                        </select>
                                                                        <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'rgba(5,34,16,0.4)' }} />
                                                                    </div>
                                                                    <button onClick={() => removeFormItem(idx)} className="p-2.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors">
                                                                        <Trash2 className="w-4 h-4" />
                                                                    </button>
                                                                </div>

                                        {/* Category — Sales only */}
                                        {activeDept === "sales" && formCategories.length > 0 && (
                                            <div className="mb-3 flex items-center gap-2">
                                                <Folder className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                                                <select
                                                    value={(item.category && formCategories.some(c => c.id === item.category)) ? item.category : (formCategories[0]?.id || '')}
                                                    onChange={e => updateFormItem(idx, { category: e.target.value })}
                                                    className="appearance-none flex-1 px-3 py-2 rounded-lg font-sans text-xs"
                                                    style={{ border: '1px solid rgba(6,161,92,0.2)', outline: 'none', background: 'rgba(6,161,92,0.04)', color: 'rgba(5,34,16,0.7)' }}
                                                >
                                                    {formCategories.map(c => (
                                                        <option key={c.id} value={c.id}>{c.name || 'Untitled'}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}

                                        {/* Depends on */}
                                        {formItems.length > 1 && (
                                            <div className="mb-3">
                                                <select
                                                    value={item.dependsOn || ''}
                                                    onChange={e => updateFormItem(idx, { dependsOn: e.target.value })}
                                                    className="appearance-none w-full px-3 py-2 rounded-lg font-sans text-xs"
                                                    style={{ border: '1px solid rgba(5,34,16,0.06)', outline: 'none', background: 'rgba(5,34,16,0.02)', color: 'rgba(5,34,16,0.6)' }}
                                                >
                                                    <option value="">No dependency</option>
                                                    {formItems.filter((_, j) => j !== idx).map(other => (
                                                        <option key={other.id} value={other.id}>{other.title || `Step ${formItems.indexOf(other) + 1}`}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}
                                        
                                        {/* Notes */}
                                        <div className="mb-3">
                                            <textarea
                                                value={item.notes || ""}
                                                onChange={e => updateFormItem(idx, { notes: e.target.value })}
                                                className="w-full px-3 py-2 rounded-lg font-sans text-xs resize-none"
                                                placeholder="Add notes or detailed instructions..."
                                                rows={2}
                                                style={{ border: '1px solid rgba(5,34,16,0.06)', outline: 'none', background: '#fff', color: '#052210' }}
                                            />
                                        </div>

                                        {/* Options for Multiple Choice/Select */}
                                        {(item.type === 'multiple_choice' || item.type === 'multiple_select') && (
                                            <div className="mb-3 space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <label className="font-sans text-[9px] font-bold tracking-wider uppercase text-gray-400">Options</label>
                                                    <button
                                                        onClick={() => {
                                                            const newOptions = [...(item.options || []), ""]
                                                            updateFormItem(idx, { options: newOptions })
                                                        }}
                                                        className="flex items-center gap-1 text-[9px] font-bold text-emerald-600 hover:text-emerald-700 uppercase tracking-tighter"
                                                    >
                                                        <Plus className="w-2.5 h-2.5" /> Add Option
                                                    </button>
                                                </div>
                                                {(item.options || []).map((o, oIdx) => (
                                                    <div key={oIdx} className="flex gap-2 items-center">
                                                        {item.type === 'multiple_choice' ? (
                                                            <div className="w-3 h-3 rounded-full border border-gray-300" />
                                                        ) : (
                                                            <div className="w-3 h-3 rounded-[3px] border border-gray-300" />
                                                        )}
                                                        <input
                                                            value={o}
                                                            onChange={e => {
                                                                const newOptions = [...(item.options || [])]
                                                                newOptions[oIdx] = e.target.value
                                                                updateFormItem(idx, { options: newOptions })
                                                            }}
                                                            className="flex-1 px-3 py-1.5 rounded-lg font-sans text-[11px]"
                                                            placeholder={`Option ${oIdx + 1}`}
                                                            style={{ border: '1px solid rgba(5,34,16,0.04)', outline: 'none', background: '#fff', color: '#052210' }}
                                                        />
                                                        <button
                                                            onClick={() => {
                                                                const newOptions = (item.options || []).filter((_, k) => k !== oIdx)
                                                                updateFormItem(idx, { options: newOptions })
                                                            }}
                                                            className="p-1.5 text-gray-300 hover:text-red-500 transition-colors"
                                                        >
                                                            <Trash2 className="w-3 h-3" />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {/* Points */}
                                        <div className="mb-3 space-y-2">
                                            <div className="flex items-center justify-between">
                                                <label className="font-sans text-[9px] font-bold tracking-wider uppercase text-gray-400">Key Points / Sub-tasks</label>
                                                <button 
                                                    onClick={() => {
                                                        const newPoints = [...(item.points || []), ""]
                                                        updateFormItem(idx, { points: newPoints })
                                                    }}
                                                    className="flex items-center gap-1 text-[9px] font-bold text-emerald-600 hover:text-emerald-700 uppercase tracking-tighter"
                                                >
                                                    <Plus className="w-2.5 h-2.5" /> Add Point
                                                </button>
                                            </div>
                                            {(item.points || []).map((p, pIdx) => (
                                                <div key={pIdx} className="flex gap-2">
                                                    <div className="mt-2 w-1 h-1 rounded-full flex-shrink-0" style={{ background: 'rgba(5,34,16,0.2)' }} />
                                                    <input
                                                        value={p}
                                                        onChange={e => {
                                                            const newPoints = [...(item.points || [])]
                                                            newPoints[pIdx] = e.target.value
                                                            updateFormItem(idx, { points: newPoints })
                                                        }}
                                                        className="flex-1 px-3 py-1.5 rounded-lg font-sans text-[11px]"
                                                        placeholder={`Detail point ${pIdx + 1}`}
                                                        style={{ border: '1px solid rgba(5,34,16,0.04)', outline: 'none', background: '#fff', color: '#052210' }}
                                                    />
                                                    <button 
                                                        onClick={() => {
                                                            const newPoints = (item.points || []).filter((_, k) => k !== pIdx)
                                                            updateFormItem(idx, { points: newPoints })
                                                        }}
                                                        className="p-1.5 text-gray-300 hover:text-red-500 transition-colors"
                                                    >
                                                        <Trash2 className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Extra Info */}
                                        <div className="mb-3">
                                            <input
                                                value={item.extraInfo || ""}
                                                onChange={e => updateFormItem(idx, { extraInfo: e.target.value })}
                                                className="w-full px-3 py-2 rounded-lg font-sans text-[10px]"
                                                placeholder="Extra configuration or metadata (Optional)"
                                                style={{ border: '1px solid rgba(5,34,16,0.06)', outline: 'none', background: '#fff', color: '#052210' }}
                                            />
                                        </div>

                                        {/* Acknowledgement Toggle */}
                                        <div className="mb-3 flex items-center justify-between px-3 py-2.5 outline-none rounded-lg" style={{ border: '1px solid rgba(5,34,16,0.06)', background: 'rgba(5,34,16,0.01)' }}>
                                            <div className="flex flex-col">
                                                <span className="font-sans text-[11px] font-bold text-gray-700">Require Acknowledgement</span>
                                                <span className="font-sans text-[9px] text-gray-500">User must explicitly tick "Yes, I have done this"</span>
                                            </div>
                                            <label className="relative inline-flex items-center cursor-pointer">
                                                <input 
                                                    type="checkbox" 
                                                    className="sr-only peer" 
                                                    checked={item.requiresAcknowledgement || false}
                                                    onChange={(e) => updateFormItem(idx, { requiresAcknowledgement: e.target.checked })}
                                                />
                                                <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                                            </label>
                                        </div>

                                        {/* Required/Optional + Delete */}
                                        <div className="flex items-center justify-between">
                                            <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid rgba(5,34,16,0.1)' }}>
                                                <button
                                                    onClick={() => updateFormItem(idx, { isRequired: true })}
                                                    className="px-3 py-1.5 font-sans text-[10px] font-bold tracking-wider uppercase transition-all"
                                                    style={{ background: item.isRequired ? '#052210' : 'transparent', color: item.isRequired ? '#fff' : 'rgba(5,34,16,0.4)' }}
                                                >Mandatory</button>
                                                <button
                                                    onClick={() => updateFormItem(idx, { isRequired: false })}
                                                    className="px-3 py-1.5 font-sans text-[10px] font-bold tracking-wider uppercase transition-all"
                                                    style={{ background: !item.isRequired ? '#052210' : 'transparent', color: !item.isRequired ? '#fff' : 'rgba(5,34,16,0.4)' }}
                                                >Optional</button>
                                            </div>
                                            {formItems.length > 1 && (
                                                <button onClick={() => removeFormItem(idx)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-red-50">
                                                    <Trash2 className="w-3.5 h-3.5" style={{ color: '#ef4444' }} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    )}
                                    </Draggable>
                                ))}
                                {provided.placeholder}
                            </div>
                            )}
                            </Droppable>
                            </DragDropContext>
                            ) : null}
                            <button onClick={addFormItem} className="mt-3 w-full py-2.5 rounded-xl font-sans text-xs font-semibold flex items-center justify-center gap-1.5 transition-all hover:bg-gray-50" style={{ color: '#06a15c', border: '1px dashed rgba(6,161,92,0.3)' }}>
                                <Plus className="w-3.5 h-3.5" /> Add Process Step
                            </button>
                        </div>

                        {/* WhatsApp Template */}
                        <div className="mb-6">
                            <label className="font-sans text-[10px] font-bold tracking-wider uppercase block mb-1.5" style={{ color: 'rgba(5,34,16,0.5)' }}>WhatsApp Message Template (Optional)</label>
                            <textarea value={formWhatsapp} onChange={e => setFormWhatsapp(e.target.value)} className="w-full px-4 py-2.5 rounded-xl font-sans text-sm resize-none" rows={3} placeholder="Variables allowed depending on pipeline stage, e.g. {customer_name}, {destination}..." style={{ border: '1px solid rgba(5,34,16,0.1)', outline: 'none' }} />
                        </div>

                        {/* Buttons */}
                        <div className="flex gap-3">
                            <button onClick={() => setShowModal(false)} className="flex-1 px-4 py-3 rounded-xl font-sans text-xs font-bold tracking-wider uppercase" style={{ border: '1px solid rgba(5,34,16,0.1)', color: 'rgba(5,34,16,0.5)' }}>Cancel</button>
                            <button onClick={handleSave} className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-sans text-xs font-bold tracking-wider uppercase transition-all hover:scale-[1.01]" style={{ background: '#052210', color: '#fff' }}>
                                <Save className="w-3.5 h-3.5" /> Save Template
                            </button>
                        </div>
                    </div>
                </div>
            )}
            
            <StatusDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                type={dialogType}
                title={dialogTitle}
                message={dialogMessage}
            />
        </div>
    )
}
