// Shared building blocks for the Admin Dashboard pages (app/src/app/admin). The names here are
// listed in /mnt/project-files/onmylead/pro/admin-shell.md for the threads that build pages.
export { AdminButton } from './button';
export { BarList, TimeSeriesChart, type Series } from './charts';
export { AdminDialogs, useConfirm, useToast, type ConfirmOptions, type ConfirmResult } from './dialogs';
export { DateRangePicker, FilterChips, rangeFor, SearchBox, type DateRange, type RangePreset } from './filters';
export { AdminGate } from './gate';
export { ADMIN_SECTIONS, sectionFor, type AdminSection } from './nav';
export { AdminPage, Columns, ComingSoon, Empty, ErrorNote, Fields, Loading, Panel } from './page';
export { AdminShell } from './shell';
export { planTone, StatGrid, StatTile, StatusBadge } from './stats';
export { DataTable, Pager, type Column } from './table';
export { AdminColors, SeriesColors, tabular, toneColor, useLayoutSize, type LayoutSize, type Tone } from './tokens';
