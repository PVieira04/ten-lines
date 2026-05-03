import { useEffect, useState } from "react";

import {
    Box,
    Button,
    Collapse,
    MenuItem,
    TextField,
    Typography,
} from "@mui/material";

import fetchTenLines, {
    computeEarliestReach,
    fetchSeedData,
    fixGameConsole,
    SEED_IDENTIFIER_TO_GAME,
    STATIC_1,
} from "../tenLines";
import NumericalInput from "./NumericalInput";
import { proxy } from "comlink";
import {
    type ExtendedSearcherState,
    type ExtendedWildSearcherState,
} from "../tenLines/generated";
import React from "react";
import {
    ABILITIES_EN,
    NATURES_EN,
    TYPES_EN,
} from "../tenLines/resources";
import IvEntry from "./IvEntry";
import { useSearchParams } from "react-router-dom";
import SearcherTable, { type EnrichedSearcherRow } from "./SearcherTable";
import SpeciesFirstEncounterSelector, {
    encounterKey,
    isStaticEncounter,
    type EncounterKey,
    type ResolvedEncounter,
} from "./SpeciesFirstEncounterSelector";

const NATURE_STAT_LABELS = ["Atk", "Def", "SpA", "SpD", "Spe"] as const;
const NATURE_DISPLAY_TO_CANONICAL = [0, 1, 3, 4, 2] as const;
const natureIdx = (rDisp: number, cDisp: number) =>
    NATURE_DISPLAY_TO_CANONICAL[rDisp] * 5 + NATURE_DISPLAY_TO_CANONICAL[cDisp];

const POKEMON_TYPE_COLORS = [
    "#C22E28", "#A98FF3", "#A33EA1", "#E2BF65",
    "#B6A136", "#A6B91A", "#735797", "#B7B7CE",
    "#EE8130", "#6390F0", "#7AC74C", "#F7D02C",
    "#F95587", "#96D9D6", "#6F35FC", "#705746",
] as const;

const POKEMON_TYPE_EMOJIS = [
    "👊", "🪶", "☠️", "⛰️",
    "🪨", "🐛", "👻", "⚙️",
    "🔥", "💧", "🌿", "⚡",
    "🔮", "❄️", "🐉", "🌑",
] as const;

type GenderRatio =
    | { kind: "genderless" }
    | { kind: "ratio"; malePct: number; femalePct: number };

function genderRatioFromThreshold(threshold: number | null): GenderRatio | null {
    if (threshold === null) return null;
    if (threshold === 255) return { kind: "genderless" };
    switch (threshold) {
        case 0:
            return { kind: "ratio", malePct: 100, femalePct: 0 };
        case 31:
            return { kind: "ratio", malePct: 87.5, femalePct: 12.5 };
        case 63:
            return { kind: "ratio", malePct: 75, femalePct: 25 };
        case 127:
            return { kind: "ratio", malePct: 50, femalePct: 50 };
        case 191:
            return { kind: "ratio", malePct: 25, femalePct: 75 };
        case 254:
            return { kind: "ratio", malePct: 0, femalePct: 100 };
        default:
            return null;
    }
}

export interface SearcherFormState {
    shininess: number;
    natures: boolean[];
    genderSelections: Set<number>;
    ability: number;
    hiddenPowerTypes: boolean[];
    minHiddenPowerStrengthString: string;
    ivRangeStrings: [string, string][];
    species: number;
    selectedKeys: Set<EncounterKey>;
    methodSelections: Set<number>;
    wildLead: number;
}

export interface SearcherURLState {
    game: string;
    trainerID: string;
    secretID: string;
    gameConsole: string;
    species: string;
}

function useSearcherURLState() {
    const [searchParams, setSearchParams] = useSearchParams();
    const game = searchParams.get("game") || "r_painting";
    const trainerID = searchParams.get("trainerID") ?? "";
    const secretID = searchParams.get("secretID") ?? "";
    const gameConsole = fixGameConsole(game, searchParams.get("gameConsole") || "GBA");
    const species = searchParams.get("species") || "0";
    const setSearcherURLState = (state: Partial<SearcherURLState>) => {
        setSearchParams((prev) => {
            for (const [key, value] of Object.entries(state)) {
                prev.set(key, value);
            }
            return prev;
        });
    };
    return {
        game,
        trainerID,
        secretID,
        gameConsole,
        species,
        setSearcherURLState,
    };
}

export default function CalibrationForm({
    sx,
    hidden,
}: {
    sx?: any;
    hidden?: boolean;
}) {
    const { game, trainerID, secretID, gameConsole, species, setSearcherURLState } =
        useSearcherURLState();

    const [searcherFormState, setSearcherFormState] =
        useState<SearcherFormState>({
            shininess: 255,
            natures: Array(NATURES_EN.length).fill(true),
            genderSelections: new Set<number>([0, 1]),
            ability: -1,
            hiddenPowerTypes: Array(TYPES_EN.length).fill(true),
            minHiddenPowerStrengthString: "",
            ivRangeStrings: [
                ["0", "31"],
                ["0", "31"],
                ["0", "31"],
                ["0", "31"],
                ["0", "31"],
                ["0", "31"],
            ],
            species: parseInt(species, 10) || 0,
            selectedKeys: new Set<EncounterKey>(),
            methodSelections: new Set<number>(),
            wildLead: 255,
        });

    const speciesNum = parseInt(species, 10) || 0;
    useEffect(() => {
        if (searcherFormState.species !== speciesNum) {
            setSearcherFormState((d) => ({
                ...d,
                species: speciesNum,
                selectedKeys: new Set<EncounterKey>(),
                methodSelections: new Set<number>(),
            }));
        }
    }, [speciesNum, searcherFormState.species]);

    const [resolvedEncounters, setResolvedEncounters] = useState<
        ResolvedEncounter[]
    >([]);
    const [hpExpanded, setHpExpanded] = useState(false);

    const [rawRows, setRawRows] = useState<
        (ExtendedSearcherState | ExtendedWildSearcherState)[]
    >([]);
    const [enrichedRows, setEnrichedRows] = useState<EnrichedSearcherRow[]>([]);
    const [searching, setSearching] = useState(false);
    const [enriching, setEnriching] = useState(false);
    const [abilityIds, setAbilityIds] = useState<[number, number] | null>(null);
    const [genderThreshold, setGenderThreshold] = useState<number | null>(null);

    useEffect(() => {
        if (!searcherFormState.species) {
            setAbilityIds(null);
            setGenderThreshold(null);
            return;
        }
        let cancelled = false;
        const load = async () => {
            const lib = await fetchTenLines();
            try {
                const abilities = await lib.get_pokemon_abilities(
                    searcherFormState.species,
                    0
                );
                const threshold = await lib.get_pokemon_gender_threshold(
                    searcherFormState.species,
                    0
                );
                if (!cancelled) {
                    setAbilityIds([abilities[0], abilities[1]]);
                    setGenderThreshold(threshold);
                    if (abilities[0] === abilities[1]) {
                        setSearcherFormState((data) => ({ ...data, ability: -1 }));
                    }
                }
            } catch {
                if (!cancelled) {
                    setAbilityIds(null);
                    setGenderThreshold(null);
                    setSearcherFormState((data) => ({ ...data, ability: -1 }));
                }
            }
        };
        setAbilityIds(null);
        setGenderThreshold(null);
        load();
        return () => {
            cancelled = true;
        };
    }, [searcherFormState.species]);

    const genderRatio = genderRatioFromThreshold(genderThreshold);

    const [ivRangesAreValid, setIvRangesAreValid] = useState(true);
    const ivRanges = ivRangesAreValid
        ? searcherFormState.ivRangeStrings.map((range) => [
            parseInt(range[0], 10),
            parseInt(range[1], 10),
        ])
        : [];

    const [trainerIDIsValid, setTrainerIDIsValid] = useState(true);
    const [secretIDIsValid, setSecretIDIsValid] = useState(true);

    const selectedEncounters = resolvedEncounters.filter((r) =>
        searcherFormState.selectedKeys.has(encounterKey(r.ref))
    );
    const hasSelections =
        selectedEncounters.length > 0 &&
        searcherFormState.methodSelections.size > 0;

    const genderForBackend = (() => {
        if (!genderRatio || genderRatio.kind === "genderless") return 255;
        const { malePct, femalePct } = genderRatio;
        if (malePct === 100) return 255;
        if (femalePct === 100) return 255;
        const sels = searcherFormState.genderSelections;
        const wantMale = sels.has(0);
        const wantFemale = sels.has(1);
        if (wantMale && wantFemale) return 255;
        if (wantMale) return 0;
        if (wantFemale) return 1;
        return -2;
    })();

    const isNotSubmittable =
        searching ||
        !trainerIDIsValid ||
        !secretIDIsValid ||
        !ivRangesAreValid ||
        !hasSelections ||
        genderForBackend === -2;

    const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (isNotSubmittable) return;
        const { natures, hiddenPowerTypes, ability, methodSelections } =
            searcherFormState;
        const minHpParsed = parseInt(
            searcherFormState.minHiddenPowerStrengthString,
            10
        );
        const minHiddenPowerStrength =
            Number.isFinite(minHpParsed) && minHpParsed >= 0 && minHpParsed <= 70
                ? minHpParsed
                : 0;
        const filterRow = (
            row: ExtendedSearcherState | ExtendedWildSearcherState
        ) =>
            natures[row.nature] &&
            hiddenPowerTypes[row.hiddenPower] &&
            row.hiddenPowerStrength >= minHiddenPowerStrength &&
            (ability === -1 || row.ability === ability);

        const tid = parseInt(trainerID, 10);
        const sid = parseInt(secretID, 10);
        const tidNum = Number.isFinite(tid) ? tid : 0;
        const sidNum = Number.isFinite(sid) ? sid : 0;

        const submit = async () => {
            const tenLines = await fetchTenLines();
            setRawRows([]);
            setEnrichedRows([]);
            setSearching(true);

            const collectedRows: (
                | ExtendedSearcherState
                | ExtendedWildSearcherState
            )[] = [];
            const appendBatch = (
                results: (
                    | ExtendedSearcherState
                    | ExtendedWildSearcherState
                )[]
            ) => {
                if (collectedRows.length > 1000 || results.length === 0) {
                    return;
                }
                const filtered = results.filter(filterRow);
                if (filtered.length === 0) return;
                collectedRows.push(...filtered);
                setRawRows((rows) => [...rows, ...filtered]);
            };
            const noopOnDone = () => {};

            const wildMethods = Array.from(methodSelections).filter(
                (m) => m >= STATIC_1 + 4
            );
            const staticMethods = Array.from(methodSelections).filter(
                (m) => m <= STATIC_1 + 3
            );

            for (const enc of selectedEncounters) {
                if (isStaticEncounter(enc.ref)) {
                    for (const method of staticMethods) {
                        await tenLines.search_seeds_static(
                            SEED_IDENTIFIER_TO_GAME[game],
                            tidNum,
                            sidNum,
                            enc.ref.category,
                            enc.staticPokemon ?? enc.ref.index,
                            method,
                            searcherFormState.shininess,
                            -1,
                            genderForBackend,
                            -1,
                            ivRanges,
                            proxy(appendBatch),
                            proxy(noopOnDone)
                        );
                    }
                } else {
                    for (const method of wildMethods) {
                        await tenLines.search_seeds_wild(
                            SEED_IDENTIFIER_TO_GAME[game],
                            tidNum,
                            sidNum,
                            enc.ref.category,
                            enc.wildLocationId ?? enc.ref.index,
                            enc.wildSpeciesForm ?? searcherFormState.species,
                            method,
                            searcherFormState.wildLead,
                            searcherFormState.shininess,
                            -1,
                            genderForBackend,
                            -1,
                            ivRanges,
                            proxy(appendBatch),
                            proxy(noopOnDone)
                        );
                    }
                }
            }

            setSearching(false);
            setEnriching(true);
            const seedData = isFRLG ? await fetchSeedData(game) : null;
            const enriched = await Promise.all(
                collectedRows.map(async (row) => {
                    const earliest = await computeEarliestReach(
                        row.seed,
                        game,
                        gameConsole,
                        seedData
                    );
                    return { ...row, earliest } as EnrichedSearcherRow;
                })
            );
            enriched.sort((a, b) => {
                const aMs = a.earliest?.totalMs ?? Number.POSITIVE_INFINITY;
                const bMs = b.earliest?.totalMs ?? Number.POSITIVE_INFINITY;
                return aMs - bMs;
            });
            setEnrichedRows(enriched);
            setEnriching(false);
        };
        submit();
    };

    const isFRLG = game.startsWith("fr") || game.startsWith("lg");
    const isMultiMethod = searcherFormState.methodSelections.size > 1;
    const isStaticOnly =
        selectedEncounters.length > 0 &&
        selectedEncounters.every((e) => isStaticEncounter(e.ref));

    if (hidden) {
        return null;
    }

    return (
        <Box component="form" onSubmit={handleSubmit} sx={sx}>
            <TextField
                label="Game"
                margin="normal"
                style={{ textAlign: "left" }}
                onChange={(event) =>
                    setSearcherURLState({
                        game: event.target.value,
                    })
                }
                value={game}
                select
                fullWidth
            >
                <MenuItem value="r_painting">Ruby Painting Seed</MenuItem>
                <MenuItem value="s_painting">Sapphire Painting Seed</MenuItem>
                <MenuItem value="e_painting">Emerald Painting Seed</MenuItem>
                <MenuItem value="fr">FireRed (ENG)</MenuItem>
                <MenuItem value="fr_eu">FireRed (SPA/FRE/ITA/GER)</MenuItem>
                <MenuItem value="fr_jpn_1_0">FireRed (JPN) (1.0)</MenuItem>
                <MenuItem value="fr_jpn_1_1">FireRed (JPN) (1.1)</MenuItem>
                <MenuItem value="fr_nx">Switch FireRed (ENG/SPA/FRE/ITA/GER)</MenuItem>
                <MenuItem value="fr_mgba">FireRed (ENG) (MGBA 10.5)</MenuItem>
                <MenuItem value="lg">LeafGreen (ENG)</MenuItem>
                <MenuItem value="lg_eu">LeafGreen (SPA/FRE/ITA/GER)</MenuItem>
                <MenuItem value="lg_jpn">LeafGreen (JPN)</MenuItem>
                <MenuItem value="lg_nx">Switch LeafGreen (ENG/SPA/FRE/ITA/GER)</MenuItem>
                <MenuItem value="lg_mgba">LeafGreen (ENG) (MGBA 10.5)</MenuItem>
            </TextField>
            <TextField
                label="Console"
                margin="normal"
                style={{ textAlign: "left" }}
                onChange={(event) =>
                    setSearcherURLState({
                        gameConsole: fixGameConsole(game, event.target.value),
                    })
                }
                value={gameConsole}
                select
                fullWidth
            >
                {game.endsWith("nx")
                    ? [
                          <MenuItem key="NX" value="NX">
                              Nintendo Switch 1
                          </MenuItem>,
                          <MenuItem key="NX2" value="NX2">
                              Nintendo Switch 2
                          </MenuItem>,
                      ]
                    : [
                          <MenuItem key="GBA" value="GBA">
                              Game Boy Advance
                          </MenuItem>,
                          <MenuItem key="GBP" value="GBP">
                              Game Boy Player
                          </MenuItem>,
                          <MenuItem key="NDS" value="NDS">
                              Nintendo DS
                          </MenuItem>,
                          <MenuItem key="3DS" value="3DS">
                              Nintendo 3DS (open_agb_firm)
                          </MenuItem>,
                      ]}
            </TextField>
            <Box sx={{ flexDirection: "row", display: "flex" }}>
                <NumericalInput
                    label="Trainer ID"
                    margin="normal"
                    onChange={(_event, value) => {
                        setSearcherURLState({ trainerID: value.value });
                        setTrainerIDIsValid(value.isValid);
                    }}
                    value={trainerID}
                    minimumValue={0}
                    maximumValue={65535}
                    isHex={false}
                    name="trainerID"
                    allowEmpty
                    placeholder="0"
                />
                <span
                    style={{
                        margin: "0 10px",
                        alignSelf: "center",
                    }}
                >
                    /
                </span>
                <NumericalInput
                    label="Secret ID"
                    margin="normal"
                    onChange={(_event, value) => {
                        setSearcherURLState({ secretID: value.value });
                        setSecretIDIsValid(value.isValid);
                    }}
                    value={secretID}
                    minimumValue={0}
                    maximumValue={65535}
                    isHex={false}
                    name="secretID"
                    allowEmpty
                    placeholder="0"
                />
            </Box>
            <SpeciesFirstEncounterSelector
                game={SEED_IDENTIFIER_TO_GAME[game]}
                species={searcherFormState.species}
                selectedKeys={searcherFormState.selectedKeys}
                methodSelections={searcherFormState.methodSelections}
                wildLead={searcherFormState.wildLead}
                onSpeciesChange={(s) => {
                    setSearcherURLState({ species: String(s) });
                }}
                onSelectedKeysChange={(keys) =>
                    setSearcherFormState((data) => ({
                        ...data,
                        selectedKeys: keys,
                    }))
                }
                onMethodSelectionsChange={(methods) =>
                    setSearcherFormState((data) => ({
                        ...data,
                        methodSelections: methods,
                    }))
                }
                onWildLeadChange={(lead) =>
                    setSearcherFormState((data) => ({ ...data, wildLead: lead }))
                }
                onResolvedEncountersChange={setResolvedEncounters}
            />

            {abilityIds && abilityIds[0] !== abilityIds[1] && (
                <TextField
                    label="Ability"
                    margin="normal"
                    style={{ textAlign: "left" }}
                    onChange={(event) => {
                        setSearcherFormState((data) => ({
                            ...data,
                            ability: parseInt(event.target.value),
                        }));
                    }}
                    value={searcherFormState.ability}
                    select
                    fullWidth
                >
                    <MenuItem value="-1">Any</MenuItem>
                    <MenuItem value="0">
                        {ABILITIES_EN[abilityIds[0] - 1]}
                    </MenuItem>
                    <MenuItem value="1">
                        {ABILITIES_EN[abilityIds[1] - 1]}
                    </MenuItem>
                </TextField>
            )}
            <TextField
                label="Shininess"
                margin="normal"
                style={{ textAlign: "left" }}
                onChange={(event) => {
                    setSearcherFormState((data) => ({
                        ...data,
                        shininess: parseInt(event.target.value),
                    }));
                }}
                value={searcherFormState.shininess}
                select
                fullWidth
            >
                <MenuItem value="255">Any</MenuItem>
                <MenuItem value="1">Star</MenuItem>
                <MenuItem value="2">Square</MenuItem>
                <MenuItem value="3">Star/Square</MenuItem>
            </TextField>
            <Box sx={{ mt: 2, mb: 1, textAlign: "left" }}>
                <Typography variant="body2" sx={{ mb: 0.5 }}>
                    Natures
                </Typography>
                <Box sx={{ mb: 0.5 }}>
                    <Button
                        size="small"
                        onClick={() =>
                            setSearcherFormState((data) => ({
                                ...data,
                                natures: Array(NATURES_EN.length).fill(true),
                            }))
                        }
                    >
                        All
                    </Button>
                    <Button
                        size="small"
                        onClick={() =>
                            setSearcherFormState((data) => ({
                                ...data,
                                natures: Array(NATURES_EN.length).fill(false),
                            }))
                        }
                    >
                        None
                    </Button>
                </Box>
                <Box sx={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
                    <Box
                        sx={{
                            display: "grid",
                            gridTemplateColumns: "auto repeat(5, minmax(56px, 1fr))",
                            gap: "1px",
                            bgcolor: "divider",
                            border: "1px solid",
                            borderColor: "divider",
                            borderRadius: 1,
                            overflow: "hidden",
                            minWidth: 340,
                        }}
                    >
                        <Box
                            sx={{
                                px: 0.5,
                                py: 0.5,
                                textAlign: "center",
                                fontSize: { xs: "0.65rem", sm: "0.75rem" },
                                fontWeight: 600,
                                bgcolor: "action.hover",
                            }}
                        >
                            ↑ \ ↓
                        </Box>
                        {NATURE_STAT_LABELS.map((stat, c) => (
                            <Box
                                key={`col-${c}`}
                                onClick={() =>
                                    setSearcherFormState((data) => {
                                        const allOn = NATURE_STAT_LABELS.every(
                                            (_, r) =>
                                                data.natures[natureIdx(r, c)]
                                        );
                                        const next = data.natures.slice();
                                        for (let r = 0; r < 5; r++)
                                            next[natureIdx(r, c)] = !allOn;
                                        return { ...data, natures: next };
                                    })
                                }
                                sx={{
                                    px: 0.5,
                                    py: 0.5,
                                    textAlign: "center",
                                    fontSize: { xs: "0.65rem", sm: "0.75rem" },
                                    fontWeight: 600,
                                    bgcolor: "#bbdefb",
                                    color: "#0d47a1",
                                    cursor: "pointer",
                                    userSelect: "none",
                                    "&:hover": { bgcolor: "#90caf9" },
                                }}
                            >
                                ↓ {stat}
                            </Box>
                        ))}
                        {NATURE_STAT_LABELS.map((rowStat, r) => (
                            <React.Fragment key={`row-${r}`}>
                                <Box
                                    onClick={() =>
                                        setSearcherFormState((data) => {
                                            const allOn = NATURE_STAT_LABELS.every(
                                                (_, c) =>
                                                    data.natures[natureIdx(r, c)]
                                            );
                                            const next = data.natures.slice();
                                            for (let c = 0; c < 5; c++)
                                                next[natureIdx(r, c)] = !allOn;
                                            return { ...data, natures: next };
                                        })
                                    }
                                    sx={{
                                        px: 0.5,
                                        py: 0.5,
                                        textAlign: "center",
                                        fontSize: { xs: "0.65rem", sm: "0.75rem" },
                                        fontWeight: 600,
                                        bgcolor: "#ffcdd2",
                                        color: "#b71c1c",
                                        cursor: "pointer",
                                        userSelect: "none",
                                        "&:hover": { bgcolor: "#ef9a9a" },
                                    }}
                                >
                                    ↑ {rowStat}
                                </Box>
                                {NATURE_STAT_LABELS.map((_, c) => {
                                    const idx = natureIdx(r, c);
                                    const selected =
                                        searcherFormState.natures[idx];
                                    return (
                                        <Box
                                            key={`cell-${idx}`}
                                            onClick={() =>
                                                setSearcherFormState((data) => {
                                                    const next =
                                                        data.natures.slice();
                                                    next[idx] = !next[idx];
                                                    return {
                                                        ...data,
                                                        natures: next,
                                                    };
                                                })
                                            }
                                            sx={{
                                                px: 0.5,
                                                py: 0.75,
                                                textAlign: "center",
                                                fontSize: { xs: "0.7rem", sm: "0.8rem" },
                                                fontWeight: selected ? 600 : 400,
                                                bgcolor: selected
                                                    ? "#2e7d32"
                                                    : "#212121",
                                                color: selected
                                                    ? "#ffffff"
                                                    : "#9e9e9e",
                                                cursor: "pointer",
                                                userSelect: "none",
                                                whiteSpace: "nowrap",
                                                transition:
                                                    "background-color 100ms",
                                                "&:hover": {
                                                    bgcolor: selected
                                                        ? "#388e3c"
                                                        : "#424242",
                                                },
                                            }}
                                        >
                                            {NATURES_EN[idx]}
                                        </Box>
                                    );
                                })}
                            </React.Fragment>
                        ))}
                    </Box>
                </Box>
            </Box>
            {genderRatio && (
                <Box sx={{ mt: 2, mb: 1, textAlign: "left" }}>
                    <Typography variant="body2" sx={{ mb: 0.5 }}>
                        Gender
                    </Typography>
                    {genderRatio.kind === "genderless" ? (
                        <Typography
                            variant="caption"
                            sx={{ color: "text.secondary" }}
                        >
                            Genderless
                        </Typography>
                    ) : (
                        <Box sx={{ display: "flex", gap: 1 }}>
                            {[
                                {
                                    code: 0,
                                    label: "♂",
                                    pct: genderRatio.malePct,
                                    selectedBg: "#1976d2",
                                },
                                {
                                    code: 1,
                                    label: "♀",
                                    pct: genderRatio.femalePct,
                                    selectedBg: "#c2185b",
                                },
                            ].map(({ code, label, pct, selectedBg }) => {
                                const lockedToThis = pct === 100;
                                const lockedAway = pct === 0;
                                if (lockedAway) return null;
                                const selected =
                                    lockedToThis ||
                                    searcherFormState.genderSelections.has(code);
                                return (
                                    <Box
                                        key={code}
                                        onClick={() => {
                                            if (lockedToThis) return;
                                            setSearcherFormState((data) => {
                                                const next = new Set(
                                                    data.genderSelections
                                                );
                                                if (next.has(code))
                                                    next.delete(code);
                                                else next.add(code);
                                                return {
                                                    ...data,
                                                    genderSelections: next,
                                                };
                                            });
                                        }}
                                        sx={{
                                            flex: 1,
                                            px: 1.5,
                                            py: 1,
                                            borderRadius: 1,
                                            textAlign: "center",
                                            cursor: lockedToThis
                                                ? "default"
                                                : "pointer",
                                            userSelect: "none",
                                            bgcolor: selected
                                                ? selectedBg
                                                : "#212121",
                                            color: selected
                                                ? "#ffffff"
                                                : "#9e9e9e",
                                            fontWeight: selected ? 600 : 400,
                                            transition:
                                                "background-color 100ms",
                                        }}
                                    >
                                        <Box
                                            component="span"
                                            sx={{ fontSize: "1.1rem", mr: 0.75 }}
                                        >
                                            {label}
                                        </Box>
                                        {pct % 1 === 0 ? pct : pct.toFixed(1)}%
                                    </Box>
                                );
                            })}
                        </Box>
                    )}
                </Box>
            )}
            <Box sx={{ mt: 2, mb: 1, textAlign: "left" }}>
                <Box
                    onClick={() => setHpExpanded((v) => !v)}
                    sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        px: 1.5,
                        py: 1,
                        bgcolor: "#212121",
                        color: "#bdbdbd",
                        borderRadius: 1,
                        cursor: "pointer",
                        userSelect: "none",
                        "&:hover": { bgcolor: "#2a2a2a" },
                    }}
                >
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        Hidden Power Types
                    </Typography>
                    <Box
                        sx={{
                            transform: hpExpanded
                                ? "rotate(180deg)"
                                : "rotate(0deg)",
                            transition: "transform 200ms",
                            fontSize: "0.85rem",
                        }}
                    >
                        ▼
                    </Box>
                </Box>
                <Collapse in={hpExpanded}>
                    <Box sx={{ display: "flex", gap: 1, mt: 1 }}>
                        {(
                            [
                                {
                                    label: "Physical",
                                    emoji: "👊",
                                    start: 0,
                                    end: 8,
                                    activeBg: "#c0392b",
                                },
                                {
                                    label: "Special",
                                    emoji: "✨",
                                    start: 8,
                                    end: 16,
                                    activeBg: "#5e35b1",
                                },
                            ] as const
                        ).map(({ label, emoji, start, end, activeBg }) => {
                            const anySelected = TYPES_EN.slice(start, end).some(
                                (_, i) =>
                                    searcherFormState.hiddenPowerTypes[
                                        start + i
                                    ]
                            );
                            return (
                                <Box key={label} sx={{ flex: 1, minWidth: 0 }}>
                                    <Box
                                        onClick={() =>
                                            setSearcherFormState((data) => {
                                                const next =
                                                    data.hiddenPowerTypes.slice();
                                                const newVal = !anySelected;
                                                for (let i = start; i < end; i++)
                                                    next[i] = newVal;
                                                return {
                                                    ...data,
                                                    hiddenPowerTypes: next,
                                                };
                                            })
                                        }
                                        sx={{
                                            px: 1,
                                            py: 0.75,
                                            mb: 0.5,
                                            textAlign: "center",
                                            bgcolor: anySelected
                                                ? activeBg
                                                : "#212121",
                                            color: anySelected
                                                ? "#ffffff"
                                                : "#9e9e9e",
                                            fontWeight: 600,
                                            fontSize: "0.85rem",
                                            borderRadius: 1,
                                            cursor: "pointer",
                                            userSelect: "none",
                                            transition:
                                                "background-color 100ms",
                                        }}
                                    >
                                        <Box
                                            component="span"
                                            sx={{ mr: 0.75 }}
                                        >
                                            {emoji}
                                        </Box>
                                        {label}
                                    </Box>
                                    <Box
                                        sx={{
                                            display: "grid",
                                            gridTemplateColumns:
                                                "repeat(2, 1fr)",
                                            gap: 0.5,
                                        }}
                                    >
                                        {TYPES_EN.slice(start, end).map(
                                            (type, i) => {
                                                const idx = start + i;
                                                const selected =
                                                    searcherFormState
                                                        .hiddenPowerTypes[idx];
                                                const color =
                                                    POKEMON_TYPE_COLORS[idx];
                                                const tEmoji =
                                                    POKEMON_TYPE_EMOJIS[idx];
                                                return (
                                                    <Box
                                                        key={idx}
                                                        onClick={() =>
                                                            setSearcherFormState(
                                                                (data) => {
                                                                    const next =
                                                                        data.hiddenPowerTypes.slice();
                                                                    next[idx] =
                                                                        !next[
                                                                            idx
                                                                        ];
                                                                    return {
                                                                        ...data,
                                                                        hiddenPowerTypes:
                                                                            next,
                                                                    };
                                                                }
                                                            )
                                                        }
                                                        sx={{
                                                            display: "flex",
                                                            alignItems:
                                                                "center",
                                                            gap: 0.5,
                                                            px: 0.75,
                                                            py: 0.6,
                                                            bgcolor: selected
                                                                ? color
                                                                : "#212121",
                                                            color: selected
                                                                ? "#ffffff"
                                                                : "#9e9e9e",
                                                            fontWeight: selected
                                                                ? 600
                                                                : 400,
                                                            fontSize: {
                                                                xs: "0.65rem",
                                                                sm: "0.75rem",
                                                            },
                                                            borderRadius: 0.5,
                                                            cursor: "pointer",
                                                            userSelect: "none",
                                                            whiteSpace:
                                                                "nowrap",
                                                            transition:
                                                                "background-color 100ms",
                                                        }}
                                                    >
                                                        <Box
                                                            component="span"
                                                            sx={{
                                                                fontSize:
                                                                    "0.85rem",
                                                            }}
                                                        >
                                                            {tEmoji}
                                                        </Box>
                                                        {type}
                                                    </Box>
                                                );
                                            }
                                        )}
                                    </Box>
                                </Box>
                            );
                        })}
                    </Box>
                    <Box
                        sx={{
                            mt: 1.5,
                            borderLeft: "3px solid #F7D02C",
                            pl: 1.25,
                        }}
                    >
                        <NumericalInput
                            label="Min Hidden Power BP (0–70, 0 disables)"
                            name="minHiddenPowerStrength"
                            margin="dense"
                            minimumValue={0}
                            maximumValue={70}
                            isHex={false}
                            value={
                                searcherFormState.minHiddenPowerStrengthString
                            }
                            onChange={(_event, value) => {
                                setSearcherFormState((data) => ({
                                    ...data,
                                    minHiddenPowerStrengthString: value.value,
                                }));
                            }}
                            allowEmpty
                            placeholder="0"
                        />
                    </Box>
                </Collapse>
            </Box>
            <IvEntry
                onChange={(_event, value) => {
                    setIvRangesAreValid(value.isValid);
                    setSearcherFormState((data) => ({
                        ...data,
                        ivRangeStrings: value.value,
                    }));
                }}
                value={searcherFormState.ivRangeStrings}
            />
            <Button
                variant="contained"
                color="primary"
                type="submit"
                disabled={isNotSubmittable}
                fullWidth
            >
                {searching
                    ? "Searching..."
                    : enriching
                        ? "Computing reach times..."
                        : "Submit"}
            </Button>
            <SearcherTable
                rows={
                    enrichedRows.length > 0
                        ? enrichedRows
                        : (rawRows as EnrichedSearcherRow[])
                }
                isStatic={isStaticOnly}
                isFRLG={isFRLG}
                gameConsole={gameConsole}
                isMultiMethod={isMultiMethod}
            />
        </Box>
    );
}
