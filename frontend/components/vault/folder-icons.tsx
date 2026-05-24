import {
  Folder, FolderOpen, FolderHeart, FolderLock, FolderKanban, FolderGit2,
  Briefcase, GraduationCap, Camera, Music, Film, Code2, BookOpen,
  Wallet, Plane, Home, Gift, Palette, Cpu,
  type LucideIcon,
} from 'lucide-react';

export type FolderIconKey =
  | 'folder' | 'folder-open' | 'folder-heart' | 'folder-lock' | 'folder-kanban' | 'folder-git'
  | 'briefcase' | 'graduation' | 'camera' | 'music' | 'film' | 'code' | 'book'
  | 'wallet' | 'plane' | 'home' | 'gift' | 'palette' | 'cpu';

export const FOLDER_ICONS: Record<FolderIconKey, { Icon: LucideIcon; label: string }> = {
  'folder':        { Icon: Folder,         label: 'General' },
  'folder-open':   { Icon: FolderOpen,     label: 'Abierta' },
  'folder-heart':  { Icon: FolderHeart,    label: 'Favoritos' },
  'folder-lock':   { Icon: FolderLock,     label: 'Privado' },
  'folder-kanban': { Icon: FolderKanban,   label: 'Proyectos' },
  'folder-git':    { Icon: FolderGit2,     label: 'Código' },
  'briefcase':     { Icon: Briefcase,      label: 'Trabajo' },
  'graduation':    { Icon: GraduationCap,  label: 'Estudios' },
  'camera':        { Icon: Camera,         label: 'Fotos' },
  'music':         { Icon: Music,          label: 'Música' },
  'film':          { Icon: Film,           label: 'Vídeos' },
  'code':          { Icon: Code2,          label: 'Desarrollo' },
  'book':          { Icon: BookOpen,       label: 'Lectura' },
  'wallet':        { Icon: Wallet,         label: 'Finanzas' },
  'plane':         { Icon: Plane,          label: 'Viajes' },
  'home':          { Icon: Home,           label: 'Casa' },
  'gift':          { Icon: Gift,           label: 'Regalos' },
  'palette':       { Icon: Palette,        label: 'Diseño' },
  'cpu':           { Icon: Cpu,            label: 'Tech' },
};

export const FOLDER_COLORS = [
  { key: 'violet',  bg: 'bg-violet-500/15',  text: 'text-violet-300',  border: 'border-violet-500/25' },
  { key: 'blue',    bg: 'bg-blue-500/15',    text: 'text-blue-300',    border: 'border-blue-500/25' },
  { key: 'cyan',    bg: 'bg-cyan-500/15',    text: 'text-cyan-300',    border: 'border-cyan-500/25' },
  { key: 'emerald', bg: 'bg-emerald-500/15', text: 'text-emerald-300', border: 'border-emerald-500/25' },
  { key: 'amber',   bg: 'bg-amber-500/15',   text: 'text-amber-300',   border: 'border-amber-500/25' },
  { key: 'rose',    bg: 'bg-rose-500/15',    text: 'text-rose-300',    border: 'border-rose-500/25' },
  { key: 'slate',   bg: 'bg-slate-500/15',   text: 'text-slate-300',   border: 'border-slate-500/25' },
] as const;

export type FolderColorKey = (typeof FOLDER_COLORS)[number]['key'];

export function getFolderColor(key?: string) {
  return FOLDER_COLORS.find((c) => c.key === key) ?? FOLDER_COLORS[0];
}
