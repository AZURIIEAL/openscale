import {
  LayoutGrid,
  GitBranch,
  Terminal,
  Database,
  FileText,
  Sparkles,
  Activity,
  Layers,
  Server,
  Settings,
} from 'lucide-react';

// Re-exported under the app's original names so navigation.ts and Sidebar
// don't need to know these are lucide-react underneath -- keeps parity
// with the mockup's Icon.jsx (which resolves lucide glyphs by name) without
// hitting a CDN for them at runtime; see NavIcons' consumers for sizing
// (Sidebar passes `h-4 w-4`, matching the mockup's 18px nav icon convention
// closely enough at this scale).
export const HomeIcon = LayoutGrid;
export const PipelinesIcon = GitBranch;
export const SqlEditorIcon = Terminal;
export const DataCatalogIcon = Database;
export const NotebooksIcon = FileText;
export const MlWorkbenchIcon = Sparkles;
export const StreamingIcon = Activity;
export const DashboardsIcon = Layers;
export const InfrastructureIcon = Server;
export const ConnectionsIcon = Settings;
