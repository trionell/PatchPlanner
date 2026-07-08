// Structural enums only: these select application behavior (which foreign
// key / code path a row uses), not terminology. The editable planning
// vocabularies (signal types, connectors, cables, stands, output and truss
// types) live in the database and are served by /api/v1/reference-data —
// use the useReferenceData hook instead of adding arrays here.
export const destinationTypes = ['local', 'stagebox', 'stage_multi'] as const
