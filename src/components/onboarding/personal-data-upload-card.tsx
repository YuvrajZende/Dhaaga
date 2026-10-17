"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  RefreshCw,
  Plus,
  Sparkles,
  Download,
  Users,
  Search,
  Edit3,
  Trash2,
  MapPin,
  Mail,
  Building2,
  Briefcase,
  X,
  Check,
  ArrowRight,
} from "lucide-react";
import { AnimatedCheck, UploadedSuccessBadge } from "@/components/ui/animated-check";

export interface PersonContact {
  id: string;
  displayName: string;
  title: string | null;
  company: string | null;
  location: string | null;
  headline: string | null;
  avatarUrl: string | null;
  bio: string | null;
  tags: string[] | null;
  primaryEmail: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PersonalDataUploadCardProps {
  onNetworkUpdate?: () => void;
}

const SAMPLE_CSV = `Name,Career / Title,Company,Location,Hobbies,Skills,Notes / Bio,Email,Phone
Liam Hendrix,Musician / Guitarist,Acoustic Soundscapes,"Vadodara, Gujarat","Playing acoustic guitar, songwriting, indie rock","guitar, musician, vocals, live performer","Plays acoustic and electric guitar for events and birthday parties. Friendly and experienced.",liam@example.com,+1-555-0192
Elena Rostova,Pastry Chef & Baker,Artisan Breads,"Mumbai, Maharashtra","Sourdough baking, French pastry, fermentation","chef, baking, culinary, sourdough","Master baker with passion for custom sourdoughs and wedding desserts.",elena@example.com,+1-555-0143
Marcus Miller,Sound Designer,Waveform Labs,"New York, NY","Synthesizers, audio mixing, jazz bass","audio engineering, sound design, acoustics","Can mix and master tracks or manage sound equipment for live gatherings.",marcus@example.com,+1-555-0188
Priya Patel,Yoga & Meditation Instructor,Mindful Living,"Vadodara, Gujarat","Vinyasa yoga, sound bowls, herbal tea brewing","yoga instructor, mindfulness, meditation","Offers private wellness sessions and mindful retreats.",priya@example.com,+1-555-0174
`;

export default function PersonalDataUploadCard({ onNetworkUpdate }: PersonalDataUploadCardProps) {
  const [contacts, setContacts] = useState<PersonContact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [contactsFetched, setContactsFetched] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"contacts" | "manual" | "upload">("contacts");
  const [searchFilter, setSearchFilter] = useState("");

  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [importedCount, setImportedCount] = useState<number | null>(null);
  const [sampleNames, setSampleNames] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Manual & Edit Form State
  const [editingPersonId, setEditingPersonId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    displayName: "",
    title: "",
    company: "",
    location: "",
    hobbies: "",
    skills: "",
    bio: "",
    primaryEmail: "",
    phone: "",
  });
  const [savingManual, setSavingManual] = useState(false);
  const [manualSuccess, setManualSuccess] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);

  // Fetch all existing contacts owned by current user
  const fetchContacts = useCallback(async () => {
    setFetchError(null);
    try {
      const res = await fetch("/api/people");
      if (res.ok) {
        const data = await res.json();
        const list: PersonContact[] = data.people || [];
        setContacts(list);

        // Auto-select tab on first fetch
        if (!contactsFetched) {
          if (list.length > 0) {
            setActiveTab("contacts");
          } else {
            setActiveTab("manual");
          }
          setContactsFetched(true);
        }
      } else {
        setFetchError("Unable to load contacts. Please verify your connection.");
      }
    } catch (err) {
      console.error("Failed to fetch user contacts:", err);
      setFetchError("Unable to load contacts. Please verify your connection.");
    } finally {
      setLoadingContacts(false);
    }
  }, [contactsFetched]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  // Restore draft from localStorage if not editing
  useEffect(() => {
    if (editingPersonId) return;
    try {
      const saved = localStorage.getItem("happenstance_draft_contact");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.displayName || parsed.bio || parsed.skills || parsed.location) {
          setFormData((prev) => ({ ...prev, ...parsed }));
        }
      }
    } catch {}
  }, [editingPersonId]);

  // Save uncommitted draft to localStorage
  useEffect(() => {
    if (!editingPersonId) {
      try {
        if (
          formData.displayName ||
          formData.title ||
          formData.company ||
          formData.location ||
          formData.hobbies ||
          formData.skills ||
          formData.bio
        ) {
          localStorage.setItem("happenstance_draft_contact", JSON.stringify(formData));
        }
      } catch {}
    }
  }, [formData, editingPersonId]);

  function downloadSampleTemplate() {
    const blob = new Blob([SAMPLE_CSV], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "happenstance_contacts_hobbies_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async function handleFile(file: File) {
    if (!file.name.endsWith(".csv") && !file.name.endsWith(".json")) {
      setError("Please select a CSV or JSON file.");
      return;
    }

    setError(null);
    setUploading(true);
    setImportedCount(null);

    try {
      const fd = new FormData();
      fd.append("file", file);

      const res = await fetch("/api/import/personal", {
        method: "POST",
        body: fd,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to import personal data");
      }

      const data = await res.json();
      setImportedCount(data.imported);
      setSampleNames(data.sampleNames || []);
      await fetchContacts();
      onNetworkUpdate?.();
      setActiveTab("contacts");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function startEditing(contact: PersonContact) {
    setEditingPersonId(contact.id);
    const tags = Array.isArray(contact.tags) ? contact.tags : [];
    setFormData({
      displayName: contact.displayName || "",
      title: contact.title || "",
      company: contact.company || "",
      location: contact.location || "",
      hobbies: "",
      skills: tags.join(", "),
      bio: contact.bio || "",
      primaryEmail: contact.primaryEmail || "",
      phone: "",
    });
    setError(null);
    setActiveTab("manual");
  }

  function cancelEditing() {
    setEditingPersonId(null);
    setFormData({
      displayName: "",
      title: "",
      company: "",
      location: "",
      hobbies: "",
      skills: "",
      bio: "",
      primaryEmail: "",
      phone: "",
    });
    try {
      localStorage.removeItem("happenstance_draft_contact");
    } catch {}
  }

  async function handleDeleteContact(id: string) {
    setDeletingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/people/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to delete contact");
      }
      setContacts((prev) => prev.filter((c) => c.id !== id));
      setConfirmDeleteId(null);
      onNetworkUpdate?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete contact");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.displayName.trim()) {
      setError("Please enter a name for the contact.");
      return;
    }

    setError(null);
    setSavingManual(true);
    setManualSuccess(null);

    try {
      if (editingPersonId) {
        // PATCH existing contact
        const hobbiesList = formData.hobbies
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        const skillsList = formData.skills
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        const combinedTags = Array.from(new Set([...hobbiesList, ...skillsList]));

        const res = await fetch(`/api/people/${editingPersonId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            displayName: formData.displayName.trim(),
            title: formData.title?.trim() || null,
            company: formData.company?.trim() || null,
            location: formData.location?.trim() || null,
            bio: formData.bio?.trim() || null,
            primaryEmail: formData.primaryEmail?.trim() || null,
            tags: combinedTags,
          }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed to update contact");
        }

        setManualSuccess(`Updated "${formData.displayName.trim()}".`);
        cancelEditing();
      } else {
        // POST new contact
        const res = await fetch("/api/people", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed to add contact");
        }

        setManualSuccess(`Added "${formData.displayName.trim()}" to your network.`);
        setFormData({
          displayName: "",
          title: "",
          company: "",
          location: "",
          hobbies: "",
          skills: "",
          bio: "",
          primaryEmail: "",
          phone: "",
        });
        try {
          localStorage.removeItem("happenstance_draft_contact");
        } catch {}
      }

      await fetchContacts();
      onNetworkUpdate?.();
      setTimeout(() => setManualSuccess(null), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save contact");
    } finally {
      setSavingManual(false);
    }
  }

  function onDrag(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  }

  const filteredContacts = contacts.filter((c) => {
    if (!searchFilter.trim()) return true;
    const q = searchFilter.toLowerCase();
    const nameMatch = c.displayName.toLowerCase().includes(q);
    const titleMatch = c.title?.toLowerCase().includes(q);
    const companyMatch = c.company?.toLowerCase().includes(q);
    const locationMatch = c.location?.toLowerCase().includes(q);
    const bioMatch = c.bio?.toLowerCase().includes(q);
    const tags = Array.isArray(c.tags) ? c.tags : [];
    const tagsMatch = tags.some((t) => t.toLowerCase().includes(q));
    return nameMatch || titleMatch || companyMatch || locationMatch || bioMatch || tagsMatch;
  });

  return (
    <section
      className={`rounded-3xl border bg-[#FFFEFA] p-6 shadow-[0_4px_24px_rgba(23,32,25,0.04)] sm:p-8 transition-all ${
        contacts.length > 0
          ? "border-emerald-600/35 ring-1 ring-emerald-500/15"
          : "border-[#E4E0D8]"
      }`}
    >
      {/* Workspace Header */}
      <div className="flex flex-col justify-between gap-5 border-b border-[#E4E0D8]/70 pb-6 sm:flex-row sm:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="h-2 w-2 rounded-full bg-[#FF4D2D]" />
            <span className="font-mono text-xs font-semibold tracking-[0.14em] text-[#777872] uppercase">
              Personal Network Workspace
            </span>
            {contacts.length > 0 && (
              <UploadedSuccessBadge countText={`${contacts.length} Contacts Indexed`} />
            )}
          </div>
          <h2 className="mt-2 font-serif text-2xl font-normal text-[#172019] sm:text-3xl">
            People, skills & context
          </h2>
          <p className="mt-1.5 max-w-2xl text-[14.5px] leading-relaxed text-[#777872]">
            Add colleagues, friends, and collaborators along with their skills, hobbies, and personal notes. Happensten indexes them privately for natural-language search.
          </p>
        </div>

        {/* Tab Controls */}
        <div className="flex shrink-0 items-center rounded-full border border-[#E4E0D8] bg-[#F6F2E9] p-1">
          <button
            type="button"
            onClick={() => {
              if (editingPersonId) cancelEditing();
              setActiveTab("contacts");
            }}
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-all ${
              activeTab === "contacts"
                ? "bg-[#183D32] text-[#FFFEFA] shadow-sm"
                : "text-[#777872] hover:text-[#172019]"
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            <span>Your Network</span>
            {contacts.length > 0 && (
              <span
                className={`ml-1 rounded-full px-1.5 py-0.2 text-[10.5px] font-semibold ${
                  activeTab === "contacts" ? "bg-white/20 text-white" : "bg-[#E4E0D8] text-[#172019]"
                }`}
              >
                {contacts.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("manual")}
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-all ${
              activeTab === "manual"
                ? "bg-[#183D32] text-[#FFFEFA] shadow-sm"
                : "text-[#777872] hover:text-[#172019]"
            }`}
          >
            {editingPersonId ? <Edit3 className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            <span>{editingPersonId ? "Edit Person" : "Quick Add"}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (editingPersonId) cancelEditing();
              setActiveTab("upload");
            }}
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-all ${
              activeTab === "upload"
                ? "bg-[#183D32] text-[#FFFEFA] shadow-sm"
                : "text-[#777872] hover:text-[#172019]"
            }`}
          >
            <UploadCloud className="h-3.5 w-3.5" />
            <span>Upload File</span>
          </button>
        </div>
      </div>

      {/* TAB 1: YOUR NETWORK */}
      {activeTab === "contacts" && (
        <div className="pt-6">
          {/* Search bar & Add button */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#777872]" />
              <input
                type="text"
                placeholder="Search by name, skill, role, city…"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="w-full rounded-2xl border border-[#E4E0D8] bg-[#F6F2E9]/60 py-2.5 pl-10 pr-4 text-sm text-[#172019] placeholder-[#777872] transition-colors focus:border-[#183D32] focus:bg-[#FFFEFA] focus:outline-none"
              />
              {searchFilter && (
                <button
                  type="button"
                  onClick={() => setSearchFilter("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#777872] hover:text-[#172019]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                cancelEditing();
                setActiveTab("manual");
              }}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#183D32] px-4 py-2.5 text-sm font-medium text-[#FFFEFA] shadow-sm transition-transform hover:scale-[1.01] active:scale-[0.98]"
            >
              <Plus className="h-4 w-4" />
              <span>Add Person</span>
            </button>
          </div>

          {/* Error & Retry State */}
          {fetchError && (
            <div className="mt-6 flex items-center justify-between rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              <div className="flex items-center gap-2.5">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                <span>{fetchError}</span>
              </div>
              <button
                type="button"
                onClick={fetchContacts}
                className="rounded-lg bg-red-100 px-3 py-1 font-medium text-red-900 hover:bg-red-200"
              >
                Retry
              </button>
            </div>
          )}

          {/* Loading Skeletons */}
          {loadingContacts ? (
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((n) => (
                <div
                  key={n}
                  className="animate-pulse rounded-2xl border border-[#E4E0D8] bg-[#F6F2E9]/50 p-5"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-[#E4E0D8]" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-4 w-28 rounded bg-[#E4E0D8]" />
                      <div className="h-3 w-36 rounded bg-[#E4E0D8]" />
                    </div>
                  </div>
                  <div className="mt-4 h-12 rounded bg-[#E4E0D8]/60" />
                  <div className="mt-3 flex gap-1.5">
                    <div className="h-5 w-14 rounded-full bg-[#E4E0D8]" />
                    <div className="h-5 w-18 rounded-full bg-[#E4E0D8]" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredContacts.length === 0 ? (
            /* Empty State */
            <div className="mt-8 rounded-3xl border border-dashed border-[#E4E0D8] bg-[#F6F2E9]/40 p-10 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#DCE8D9] text-[#183D32]">
                <Users className="h-8 w-8" />
              </div>
              <h3 className="mt-4 font-serif text-xl font-normal text-[#172019]">
                {searchFilter ? "No matches found" : "Your network workspace is empty"}
              </h3>
              <p className="mx-auto mt-2 max-w-md text-sm text-[#777872]">
                {searchFilter
                  ? `No contacts matched "${searchFilter}". Try a broader term or clear your search.`
                  : "Start adding colleagues, friends, or collaborators manually, or drop in a CSV to index skills and interests."}
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    cancelEditing();
                    setActiveTab("manual");
                  }}
                  className="inline-flex items-center gap-2 rounded-2xl bg-[#FF4D2D] px-5 py-2.5 text-sm font-semibold text-[#FFFEFA] shadow-[0_2px_10px_rgba(255,77,45,0.2)] transition-transform hover:scale-[1.02] active:scale-[0.98]"
                >
                  <Plus className="h-4 w-4" />
                  <span>Add First Person</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("upload")}
                  className="inline-flex items-center gap-2 rounded-2xl border border-[#E4E0D8] bg-[#FFFEFA] px-4 py-2.5 text-sm font-medium text-[#172019] hover:bg-[#F6F2E9]"
                >
                  <UploadCloud className="h-4 w-4 text-[#777872]" />
                  <span>Upload CSV</span>
                </button>
              </div>
            </div>
          ) : (
            /* Contact Cards Grid */
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredContacts.map((contact) => {
                const tags = Array.isArray(contact.tags) ? contact.tags : [];
                const initials = contact.displayName
                  ? contact.displayName
                      .split(" ")
                      .map((p) => p[0])
                      .slice(0, 2)
                      .join("")
                      .toUpperCase()
                  : "?";

                return (
                  <div
                    key={contact.id}
                    className="group relative flex flex-col justify-between rounded-2xl border border-[#E4E0D8] bg-[#FFFEFA] p-5 shadow-[0_2px_8px_rgba(23,32,25,0.03)] transition-all hover:-translate-y-0.5 hover:border-[#183D32]/40 hover:shadow-[0_8px_24px_rgba(23,32,25,0.06)]"
                  >
                    <div>
                      {/* Top Bar: Avatar, Info, Actions */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          {contact.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={contact.avatarUrl}
                              alt={contact.displayName}
                              className="h-10 w-10 rounded-full object-cover ring-1 ring-[#E4E0D8]"
                            />
                          ) : (
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#183D32] text-xs font-semibold text-[#FFFEFA]">
                              {initials}
                            </div>
                          )}
                          <div className="min-w-0">
                            <h4 className="truncate text-[15px] font-semibold text-[#172019]">
                              {contact.displayName}
                            </h4>
                            {contact.title && (
                              <p className="truncate text-xs font-medium text-[#777872]">
                                {contact.title}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Edit & Delete Controls */}
                        <div className="flex items-center gap-1 opacity-70 transition-opacity group-hover:opacity-100">
                          <button
                            type="button"
                            onClick={() => startEditing(contact)}
                            aria-label={`Edit ${contact.displayName}`}
                            className="rounded-lg p-1.5 text-[#777872] transition-colors hover:bg-[#F6F2E9] hover:text-[#172019]"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(contact.id)}
                            aria-label={`Delete ${contact.displayName}`}
                            className="rounded-lg p-1.5 text-[#777872] transition-colors hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Company & Location Badges */}
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[#777872]">
                        {contact.company && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-[#F6F2E9] px-2 py-0.5 font-medium text-[#172019]">
                            <Building2 className="h-3 w-3 opacity-60" />
                            <span className="truncate max-w-[140px]">{contact.company}</span>
                          </span>
                        )}
                        {contact.location && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-[#F6F2E9] px-2 py-0.5 text-[#777872]">
                            <MapPin className="h-3 w-3 opacity-60" />
                            <span className="truncate max-w-[120px]">{contact.location}</span>
                          </span>
                        )}
                      </div>

                      {/* Bio Excerpt */}
                      {contact.bio && (
                        <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-[#777872]">
                          {contact.bio}
                        </p>
                      )}
                    </div>

                    {/* Skill/Hobby Tags */}
                    {tags.length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-1.5 border-t border-[#E4E0D8]/60 pt-3">
                        {tags.slice(0, 4).map((tag, idx) => (
                          <span
                            key={idx}
                            className="rounded-full bg-[#DCE8D9]/70 px-2 py-0.5 text-[11px] font-medium text-[#183D32]"
                          >
                            {tag}
                          </span>
                        ))}
                        {tags.length > 4 && (
                          <span className="rounded-full bg-[#F6F2E9] px-2 py-0.5 text-[11px] font-medium text-[#777872]">
                            +{tags.length - 4} more
                          </span>
                        )}
                      </div>
                    )}

                    {/* Inline Delete Confirmation Popover */}
                    {confirmDeleteId === contact.id && (
                      <div className="absolute inset-0 z-10 flex flex-col justify-center rounded-2xl bg-[#FFFEFA]/95 p-5 backdrop-blur-sm">
                        <p className="text-center text-xs font-semibold text-[#172019]">
                          Delete {contact.displayName}?
                        </p>
                        <p className="mt-1 text-center text-[11px] text-[#777872]">
                          This will remove them from your private graph.
                        </p>
                        <div className="mt-3 flex justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="rounded-xl border border-[#E4E0D8] bg-[#FFFEFA] px-3 py-1.5 text-xs font-medium text-[#172019] hover:bg-[#F6F2E9]"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            disabled={deletingId === contact.id}
                            onClick={() => handleDeleteContact(contact.id)}
                            className="rounded-xl bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                          >
                            {deletingId === contact.id ? "Deleting…" : "Confirm Delete"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: QUICK ADD / EDIT PERSON */}
      {activeTab === "manual" && (
        <form onSubmit={handleManualSubmit} className="pt-6 space-y-5">
          <div className="flex items-center justify-between border-b border-[#E4E0D8]/60 pb-3">
            <h3 className="font-serif text-lg font-normal text-[#172019]">
              {editingPersonId ? "Edit Contact" : "Add New Person"}
            </h3>
            {editingPersonId && (
              <button
                type="button"
                onClick={cancelEditing}
                className="text-xs font-medium text-[#777872] hover:text-[#172019]"
              >
                Cancel editing
              </button>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#777872]">
                Full Name *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Liam Hendrix"
                value={formData.displayName}
                onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                className="mt-1.5 w-full rounded-2xl border border-[#E4E0D8] bg-[#F6F2E9]/40 px-4 py-2.5 text-sm text-[#172019] transition-colors focus:border-[#183D32] focus:bg-[#FFFEFA] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#777872]">
                Career / Role / Title
              </label>
              <input
                type="text"
                placeholder="e.g. Musician / Acoustic Guitarist"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="mt-1.5 w-full rounded-2xl border border-[#E4E0D8] bg-[#F6F2E9]/40 px-4 py-2.5 text-sm text-[#172019] transition-colors focus:border-[#183D32] focus:bg-[#FFFEFA] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#777872]">
                Company / Organization
              </label>
              <input
                type="text"
                placeholder="e.g. Waveform Labs"
                value={formData.company}
                onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                className="mt-1.5 w-full rounded-2xl border border-[#E4E0D8] bg-[#F6F2E9]/40 px-4 py-2.5 text-sm text-[#172019] transition-colors focus:border-[#183D32] focus:bg-[#FFFEFA] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#777872]">
                City / Location
              </label>
              <input
                type="text"
                placeholder="e.g. Vadodara, Gujarat or New York, NY"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                className="mt-1.5 w-full rounded-2xl border border-[#E4E0D8] bg-[#F6F2E9]/40 px-4 py-2.5 text-sm text-[#172019] transition-colors focus:border-[#183D32] focus:bg-[#FFFEFA] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#777872]">
                Primary Email
              </label>
              <input
                type="email"
                placeholder="e.g. liam@example.com"
                value={formData.primaryEmail}
                onChange={(e) => setFormData({ ...formData, primaryEmail: e.target.value })}
                className="mt-1.5 w-full rounded-2xl border border-[#E4E0D8] bg-[#F6F2E9]/40 px-4 py-2.5 text-sm text-[#172019] transition-colors focus:border-[#183D32] focus:bg-[#FFFEFA] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#777872]">
                Skills & Talents (Comma-separated)
              </label>
              <input
                type="text"
                placeholder="e.g. acoustic guitar, songwriting, live sound"
                value={formData.skills}
                onChange={(e) => setFormData({ ...formData, skills: e.target.value })}
                className="mt-1.5 w-full rounded-2xl border border-[#E4E0D8] bg-[#F6F2E9]/40 px-4 py-2.5 text-sm text-[#172019] transition-colors focus:border-[#183D32] focus:bg-[#FFFEFA] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#777872]">
              Notes / Bio / Context
            </label>
            <textarea
              rows={3}
              placeholder="e.g. Plays guitar for private events and birthday parties. Friendly, responsive, and loves indie folk music."
              value={formData.bio}
              onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
              className="mt-1.5 w-full rounded-2xl border border-[#E4E0D8] bg-[#F6F2E9]/40 px-4 py-2.5 text-sm text-[#172019] transition-colors focus:border-[#183D32] focus:bg-[#FFFEFA] focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <span className="font-mono text-[11.5px] text-[#777872]">
              Vectorized locally. Ready for natural-language search.
            </span>

            <div className="flex items-center gap-3">
              {editingPersonId && (
                <button
                  type="button"
                  onClick={cancelEditing}
                  className="rounded-2xl border border-[#E4E0D8] bg-[#FFFEFA] px-5 py-2.5 text-sm font-medium text-[#172019] hover:bg-[#F6F2E9]"
                >
                  Cancel
                </button>
              )}
              <button
                type="submit"
                disabled={savingManual}
                className="inline-flex items-center gap-2 rounded-2xl bg-[#FF4D2D] px-6 py-2.5 text-sm font-semibold text-[#FFFEFA] shadow-[0_2px_12px_rgba(255,77,45,0.25)] transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
              >
                {savingManual ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Saving…</span>
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    <span>{editingPersonId ? "Update Person" : "Save Person"}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {manualSuccess && (
            <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs text-emerald-800">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              <span>{manualSuccess}</span>
            </div>
          )}
        </form>
      )}

      {/* TAB 3: UPLOAD FILE */}
      {activeTab === "upload" && (
        <div className="pt-6 space-y-4">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h3 className="font-serif text-lg font-normal text-[#172019]">
                Bulk import contacts & hobbies
              </h3>
              <p className="text-xs text-[#777872]">
                Drop a spreadsheet with names, occupations, skills, and notes.
              </p>
            </div>

            <button
              type="button"
              onClick={downloadSampleTemplate}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#183D32] hover:underline"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Download sample CSV template</span>
            </button>
          </div>

          <div
            onDragEnter={onDrag}
            onDragLeave={onDrag}
            onDragOver={onDrag}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className={`border-2 border-dashed rounded-3xl p-8 text-center cursor-pointer transition-all ${
              dragActive
                ? "border-[#183D32] bg-[#DCE8D9]/30"
                : "border-[#E4E0D8] hover:border-[#183D32]/50 bg-[#F6F2E9]/30"
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.json"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />

            {uploading ? (
              <div className="flex flex-col items-center gap-2">
                <RefreshCw className="h-8 w-8 animate-spin text-[#183D32]" />
                <p className="text-sm font-semibold text-[#172019]">
                  Parsing & vectorizing contacts…
                </p>
                <p className="text-xs text-[#777872]">Generating 384-dimensional local embeddings</p>
              </div>
            ) : importedCount !== null ? (
              <div className="flex flex-col items-center gap-2 text-[#183D32]">
                <AnimatedCheck size={28} className="my-1 scale-125" />
                <p className="text-sm font-semibold text-[#172019]">
                  Successfully imported {importedCount} contacts!
                </p>
                {sampleNames.length > 0 && (
                  <p className="text-xs text-[#777872]">
                    Indexed: {sampleNames.slice(0, 3).join(", ")}
                    {sampleNames.length > 3 ? "…" : ""}
                  </p>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#DCE8D9] text-[#183D32]">
                  <FileSpreadsheet className="h-6 w-6" />
                </div>
                <p className="text-sm font-medium text-[#172019]">
                  Drop your CSV or JSON file here or{" "}
                  <span className="font-semibold text-[#FF4D2D]">browse</span>
                </p>
                <p className="text-xs text-[#777872]">
                  Supports Name, Career, Location, Skills, and Bio columns
                </p>
              </div>
            )}
          </div>

          <p className="text-center font-mono text-[11px] text-[#777872]">
            Processed in-memory. Your original file is never saved to disk.
          </p>
        </div>
      )}

      {error && (
        <div className="mt-4 flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-800">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
          <span>{error}</span>
        </div>
      )}
    </section>
  );
}
