import { useEffect, useMemo, useState } from "react";
import {
    Autocomplete,
    Box,
    Button,
    Checkbox,
    FormControlLabel,
    FormGroup,
    MenuItem,
    TextField,
    Typography,
} from "@mui/material";

import fetchTenLines, {
    Game,
    STATIC_1,
    STATIC_4,
    WILD_1,
    WILD_2,
    WILD_4,
} from "../tenLines";
import type { EncounterRef } from "../tenLines/generated";
import {
    GAMES_EN,
    METHODS_EN,
    SPECIES_EN,
    getLocationEn,
    getNameEn,
} from "../tenLines/resources";

const WILD_CATEGORY_LABELS: Record<number, string> = {
    0: "Grass",
    3: "Rock Smash",
    4: "Surfing",
    6: "Old Rod",
    7: "Good Rod",
    8: "Super Rod",
};

const STATIC_CATEGORY_LABELS: Record<number, string> = {
    0: "Starters",
    1: "Fossils",
    2: "Gifts",
    3: "Game Corner",
    4: "Stationary",
    5: "Legends",
    6: "Events",
    7: "Roamers",
    8: "Blisy's E-Reader Events",
};

const WILD_METHODS = [WILD_1, WILD_2, WILD_4];
const STATIC_METHODS = [STATIC_1, STATIC_4];

export type EncounterKey = string;

export const encounterKey = (e: EncounterRef): EncounterKey =>
    `${e.isStatic}-${e.category}-${e.index}`;

export interface ResolvedEncounter {
    ref: EncounterRef;
    label: string;
    wildLocationId?: number;
    wildSpeciesForm?: number;
    staticPokemon?: number;
}

export const isStaticEncounter = (ref: EncounterRef) => ref.isStatic === 1;

function WildLeadPicker({
    wildLead,
    onChange,
}: {
    wildLead: number;
    onChange: (lead: number) => void;
}) {
    return (
        <TextField
            label="Lead"
            margin="normal"
            style={{ textAlign: "left" }}
            onChange={(event) => onChange(parseInt(event.target.value))}
            value={wildLead}
            select
            fullWidth
        >
            <MenuItem value="255">None</MenuItem>
            <MenuItem value="25">Female Cute Charm</MenuItem>
            <MenuItem value="26">Male Cute Charm</MenuItem>
            <MenuItem value="27">Magnet Pull</MenuItem>
            <MenuItem value="28">Static</MenuItem>
            <MenuItem value="32">Hustle/Pressure/Vital Spirit</MenuItem>
            <MenuItem value="0">Matching Synchronize</MenuItem>
        </TextField>
    );
}

export default function SpeciesFirstEncounterSelector({
    game,
    species,
    selectedKeys,
    methodSelections,
    wildLead,
    onSpeciesChange,
    onSelectedKeysChange,
    onMethodSelectionsChange,
    onWildLeadChange,
    onResolvedEncountersChange,
}: {
    game: number;
    species: number;
    selectedKeys: Set<EncounterKey>;
    methodSelections: Set<number>;
    wildLead: number;
    onSpeciesChange: (species: number) => void;
    onSelectedKeysChange: (keys: Set<EncounterKey>) => void;
    onMethodSelectionsChange: (methods: Set<number>) => void;
    onWildLeadChange: (lead: number) => void;
    onResolvedEncountersChange: (encounters: ResolvedEncounter[]) => void;
}) {
    const [resolved, setResolved] = useState<ResolvedEncounter[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!species) {
            setResolved([]);
            onResolvedEncountersChange([]);
            return;
        }
        let cancelled = false;
        const load = async () => {
            setLoading(true);
            const lib = await fetchTenLines();
            try {
                const refs: EncounterRef[] = await lib.get_encounters_for_species(
                    game,
                    species
                );
                if (cancelled) return;
                const refsArr = Array.isArray(refs)
                    ? refs
                    : Array.from(refs as ArrayLike<EncounterRef>);

                const resolvedList: ResolvedEncounter[] = [];
                for (const ref of refsArr) {
                    if (ref.isStatic === 0) {
                        const locs: number[] = await lib.get_wild_locations(
                            game,
                            ref.category
                        );
                        const locationId = (locs as unknown as number[])[ref.index];
                        const speciesList: number[] =
                            await lib.get_area_species(
                                game,
                                ref.category,
                                ref.index
                            );
                        const speciesArr = speciesList as unknown as number[];
                        const speciesForm =
                            speciesArr.find((sf) => (sf & 0x7ff) === species) ??
                            species;
                        const locationName =
                            getLocationEn(game, locationId) ?? `Loc ${locationId}`;
                        resolvedList.push({
                            ref,
                            label: `${WILD_CATEGORY_LABELS[ref.category] ?? `Cat ${ref.category}`} — ${locationName}`,
                            wildLocationId: ref.index,
                            wildSpeciesForm: speciesForm,
                        });
                    } else {
                        const templates = await lib.get_static_template_info(
                            ref.category
                        );
                        const templatesArr = templates as unknown as Array<{
                            index: number;
                            version: number;
                            species: number;
                            form: number;
                            shiny: number;
                        }>;
                        const tpl = templatesArr.find(
                            (t) => t.index === ref.index
                        );
                        const versionName = tpl
                            ? GAMES_EN[tpl.version] ?? `v${tpl.version}`
                            : "";
                        const formName = tpl
                            ? getNameEn(tpl.species, tpl.form)
                            : SPECIES_EN[species];
                        const lockNote = tpl
                            ? tpl.shiny === 1
                                ? " (Shiny Locked)"
                                : tpl.species === 251
                                ? " (Lock Break)"
                                : ""
                            : "";
                        resolvedList.push({
                            ref,
                            label: `${STATIC_CATEGORY_LABELS[ref.category] ?? `Cat ${ref.category}`} — ${formName}${lockNote}${versionName ? ` (${versionName})` : ""}`,
                            staticPokemon: ref.index,
                        });
                    }
                }
                if (cancelled) return;
                setResolved(resolvedList);
                onResolvedEncountersChange(resolvedList);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        load();
        return () => {
            cancelled = true;
        };
    }, [game, species]);

    const hasWild = useMemo(
        () => resolved.some((r) => !isStaticEncounter(r.ref) && selectedKeys.has(encounterKey(r.ref))),
        [resolved, selectedKeys]
    );
    const hasStatic = useMemo(
        () => resolved.some((r) => isStaticEncounter(r.ref) && selectedKeys.has(encounterKey(r.ref))),
        [resolved, selectedKeys]
    );

    useEffect(() => {
        const next = new Set(methodSelections);
        let changed = false;
        if (!hasWild) {
            for (const m of WILD_METHODS) {
                if (next.delete(m)) changed = true;
            }
        }
        if (!hasStatic) {
            for (const m of STATIC_METHODS) {
                if (next.delete(m)) changed = true;
            }
        }
        if (
            hasWild &&
            !WILD_METHODS.some((m) => next.has(m))
        ) {
            next.add(WILD_1);
            changed = true;
        }
        if (
            hasStatic &&
            !STATIC_METHODS.some((m) => next.has(m))
        ) {
            next.add(STATIC_1);
            changed = true;
        }
        if (changed) onMethodSelectionsChange(next);
    }, [hasWild, hasStatic, methodSelections, onMethodSelectionsChange]);

    useEffect(() => {
        if (resolved.length === 0) return;
        if (selectedKeys.size === 0) {
            const all = new Set(resolved.map((r) => encounterKey(r.ref)));
            onSelectedKeysChange(all);
        } else {
            const validKeys = new Set(resolved.map((r) => encounterKey(r.ref)));
            const filtered = new Set(
                Array.from(selectedKeys).filter((k) => validKeys.has(k))
            );
            if (filtered.size !== selectedKeys.size) {
                onSelectedKeysChange(filtered);
            }
        }
    }, [resolved, selectedKeys, onSelectedKeysChange]);

    const speciesOptions = useMemo(
        () => SPECIES_EN.map((_, i) => i).slice(1),
        []
    );

    const isEmerald = (game & Game.Emerald) === Game.Emerald;
    const visibleMethods = [
        ...(hasWild ? WILD_METHODS : []),
        ...(hasStatic ? STATIC_METHODS : []),
    ];

    const toggleEncounter = (key: EncounterKey, checked: boolean) => {
        const next = new Set(selectedKeys);
        if (checked) next.add(key);
        else next.delete(key);
        onSelectedKeysChange(next);
    };

    const toggleMethod = (method: number, checked: boolean) => {
        const next = new Set(methodSelections);
        if (checked) next.add(method);
        else next.delete(method);
        onMethodSelectionsChange(next);
    };

    const renderEmptyState = () => {
        if (!species) {
            return (
                <Typography
                    variant="body2"
                    sx={{ mt: 1, fontStyle: "italic", color: "text.secondary" }}
                >
                    Pick a Pokémon to see where it can be hunted.
                </Typography>
            );
        }
        if (loading) {
            return (
                <Typography
                    variant="body2"
                    sx={{ mt: 1, fontStyle: "italic", color: "text.secondary" }}
                >
                    Loading encounters…
                </Typography>
            );
        }
        if (resolved.length === 0) {
            return (
                <Typography
                    variant="body2"
                    sx={{ mt: 1, fontStyle: "italic", color: "warning.main" }}
                >
                    {SPECIES_EN[species]} isn't obtainable in this game.
                </Typography>
            );
        }
        return null;
    };

    return (
        <Box>
            <Autocomplete
                options={speciesOptions}
                value={species || null}
                onChange={(_event, newValue) =>
                    onSpeciesChange(newValue ?? 0)
                }
                getOptionLabel={(option) => SPECIES_EN[option] ?? ""}
                renderInput={(params) => (
                    <TextField
                        {...params}
                        label="Pokémon"
                        margin="normal"
                    />
                )}
                disablePortal
                selectOnFocus
                fullWidth
            />
            {renderEmptyState()}
            {resolved.length > 0 && (
                <Box sx={{ mt: 2, textAlign: "left" }}>
                    <Typography variant="body2" sx={{ mb: 0.5 }}>
                        Found in
                    </Typography>
                    <Box sx={{ mb: 0.5 }}>
                        <Button
                            size="small"
                            onClick={() =>
                                onSelectedKeysChange(
                                    new Set(resolved.map((r) => encounterKey(r.ref)))
                                )
                            }
                        >
                            All
                        </Button>
                        <Button
                            size="small"
                            onClick={() => onSelectedKeysChange(new Set())}
                        >
                            None
                        </Button>
                    </Box>
                    <FormGroup>
                        {resolved.map((r) => {
                            const key = encounterKey(r.ref);
                            return (
                                <FormControlLabel
                                    key={key}
                                    control={
                                        <Checkbox
                                            size="small"
                                            checked={selectedKeys.has(key)}
                                            onChange={(event) =>
                                                toggleEncounter(
                                                    key,
                                                    event.target.checked
                                                )
                                            }
                                        />
                                    }
                                    label={r.label}
                                />
                            );
                        })}
                    </FormGroup>
                </Box>
            )}
            {visibleMethods.length > 0 && (
                <Box sx={{ mt: 2, textAlign: "left" }}>
                    <Typography variant="body2" sx={{ mb: 0.5 }}>
                        Methods
                    </Typography>
                    <FormGroup
                        sx={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                        }}
                    >
                        {visibleMethods.map((m) => (
                            <FormControlLabel
                                key={m}
                                control={
                                    <Checkbox
                                        size="small"
                                        checked={methodSelections.has(m)}
                                        onChange={(event) =>
                                            toggleMethod(m, event.target.checked)
                                        }
                                    />
                                }
                                label={METHODS_EN[m] ?? `Method ${m}`}
                            />
                        ))}
                    </FormGroup>
                </Box>
            )}
            {hasWild && isEmerald && (
                <WildLeadPicker
                    wildLead={wildLead}
                    onChange={onWildLeadChange}
                />
            )}
        </Box>
    );
}

