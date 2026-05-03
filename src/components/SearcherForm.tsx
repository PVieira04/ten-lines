import { useEffect, useState } from "react";

import {
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
    COMBINED_WILD_METHOD,
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
    GENDERS_EN,
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

const NATURE_STAT_LABELS = ["Atk", "Def", "Spe", "SpA", "SpD"] as const;

export interface SearcherFormState {
    shininess: number;
    natures: boolean[];
    gender: number;
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
    const trainerID = searchParams.get("trainerID") || "0";
    const secretID = searchParams.get("secretID") || "0";
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
            gender: 255,
            ability: -1,
            hiddenPowerTypes: Array(TYPES_EN.length).fill(true),
            minHiddenPowerStrengthString: "30",
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

    const [rawRows, setRawRows] = useState<
        (ExtendedSearcherState | ExtendedWildSearcherState)[]
    >([]);
    const [enrichedRows, setEnrichedRows] = useState<EnrichedSearcherRow[]>([]);
    const [searching, setSearching] = useState(false);
    const [enriching, setEnriching] = useState(false);
    const [abilityIds, setAbilityIds] = useState<[number, number] | null>(null);

    useEffect(() => {
        if (!searcherFormState.species) {
            setAbilityIds(null);
            return;
        }
        let cancelled = false;
        const load = async () => {
            const lib = await fetchTenLines();
            try {
                const result = await lib.get_pokemon_abilities(
                    searcherFormState.species,
                    0
                );
                if (!cancelled) {
                    setAbilityIds([result[0], result[1]]);
                    if (result[0] === result[1]) {
                        setSearcherFormState((data) => ({ ...data, ability: -1 }));
                    }
                }
            } catch {
                if (!cancelled) {
                    setAbilityIds(null);
                    setSearcherFormState((data) => ({ ...data, ability: -1 }));
                }
            }
        };
        setAbilityIds(null);
        load();
        return () => {
            cancelled = true;
        };
    }, [searcherFormState.species]);

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

    const isNotSubmittable =
        searching ||
        !trainerIDIsValid ||
        !secretIDIsValid ||
        !ivRangesAreValid ||
        !hasSelections;

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
                            parseInt(trainerID),
                            parseInt(secretID),
                            enc.ref.category,
                            enc.staticPokemon ?? enc.ref.index,
                            method,
                            searcherFormState.shininess,
                            -1,
                            searcherFormState.gender,
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
                            parseInt(trainerID),
                            parseInt(secretID),
                            enc.ref.category,
                            enc.wildLocationId ?? enc.ref.index,
                            enc.wildSpeciesForm ?? searcherFormState.species,
                            method,
                            searcherFormState.wildLead,
                            searcherFormState.shininess,
                            -1,
                            searcherFormState.gender,
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
    const isMultiMethod =
        searcherFormState.methodSelections.has(COMBINED_WILD_METHOD) ||
        searcherFormState.methodSelections.size > 1;
    const isStaticOnly =
        selectedEncounters.length > 0 &&
        selectedEncounters.every((e) => isStaticEncounter(e.ref));

    if (hidden) {
        return null;
    }

    return (
        <Box component="form" onSubmit={handleSubmit} sx={{ sx }}>
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
                <Box
                    sx={{
                        display: "grid",
                        gridTemplateColumns: "auto repeat(5, 1fr)",
                        border: "1px solid",
                        borderColor: "divider",
                        borderRadius: 1,
                        overflow: "hidden",
                    }}
                >
                    <Box
                        sx={{
                            p: 0.5,
                            textAlign: "center",
                            fontSize: "0.75rem",
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
                                        (_, r) => data.natures[r * 5 + c]
                                    );
                                    const next = data.natures.slice();
                                    for (let r = 0; r < 5; r++)
                                        next[r * 5 + c] = !allOn;
                                    return { ...data, natures: next };
                                })
                            }
                            sx={{
                                p: 0.5,
                                textAlign: "center",
                                fontSize: "0.75rem",
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
                                        const start = r * 5;
                                        const allOn = data.natures
                                            .slice(start, start + 5)
                                            .every(Boolean);
                                        const next = data.natures.slice();
                                        for (let c = 0; c < 5; c++)
                                            next[start + c] = !allOn;
                                        return { ...data, natures: next };
                                    })
                                }
                                sx={{
                                    p: 0.5,
                                    textAlign: "center",
                                    fontSize: "0.75rem",
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
                                const idx = r * 5 + c;
                                return (
                                    <FormControlLabel
                                        key={`cell-${idx}`}
                                        sx={{
                                            m: 0,
                                            justifyContent: "center",
                                            whiteSpace: "nowrap",
                                        }}
                                        control={
                                            <Checkbox
                                                size="small"
                                                checked={
                                                    searcherFormState.natures[
                                                        idx
                                                    ]
                                                }
                                                onChange={(event) => {
                                                    const checked =
                                                        event.target.checked;
                                                    setSearcherFormState(
                                                        (data) => {
                                                            const next =
                                                                data.natures.slice();
                                                            next[idx] = checked;
                                                            return {
                                                                ...data,
                                                                natures: next,
                                                            };
                                                        }
                                                    );
                                                }}
                                            />
                                        }
                                        label={NATURES_EN[idx]}
                                    />
                                );
                            })}
                        </React.Fragment>
                    ))}
                </Box>
            </Box>
            <TextField
                label="Gender"
                margin="normal"
                style={{ textAlign: "left" }}
                onChange={(event) => {
                    setSearcherFormState((data) => ({
                        ...data,
                        gender: parseInt(event.target.value),
                    }));
                }}
                value={searcherFormState.gender}
                select
                fullWidth
            >
                <MenuItem value="255">Any</MenuItem>
                {GENDERS_EN.slice(0, 2).map((gender, index) => (
                    <MenuItem key={index} value={index}>
                        {gender}
                    </MenuItem>
                ))}
            </TextField>
            <Box sx={{ mt: 2, mb: 1, textAlign: "left" }}>
                <Typography variant="body2" sx={{ mb: 0.5 }}>
                    Hidden Power Types
                </Typography>
                <Box sx={{ mb: 0.5 }}>
                    <Button
                        size="small"
                        onClick={() =>
                            setSearcherFormState((data) => ({
                                ...data,
                                hiddenPowerTypes: Array(
                                    TYPES_EN.length
                                ).fill(true),
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
                                hiddenPowerTypes: Array(
                                    TYPES_EN.length
                                ).fill(false),
                            }))
                        }
                    >
                        None
                    </Button>
                </Box>
                {(
                    [
                        { label: "Physical", start: 0, end: 8 },
                        { label: "Special", start: 8, end: 16 },
                    ] as const
                ).map(({ label, start, end }) => (
                    <Box key={label} sx={{ mt: 1 }}>
                        <Box
                            sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: 1,
                                mb: 0.25,
                            }}
                        >
                            <Typography
                                variant="caption"
                                sx={{ minWidth: 60, fontWeight: 600 }}
                            >
                                {label}
                            </Typography>
                            <Button
                                size="small"
                                onClick={() =>
                                    setSearcherFormState((data) => {
                                        const next =
                                            data.hiddenPowerTypes.slice();
                                        for (let i = start; i < end; i++)
                                            next[i] = true;
                                        return {
                                            ...data,
                                            hiddenPowerTypes: next,
                                        };
                                    })
                                }
                            >
                                All
                            </Button>
                            <Button
                                size="small"
                                onClick={() =>
                                    setSearcherFormState((data) => {
                                        const next =
                                            data.hiddenPowerTypes.slice();
                                        for (let i = start; i < end; i++)
                                            next[i] = false;
                                        return {
                                            ...data,
                                            hiddenPowerTypes: next,
                                        };
                                    })
                                }
                            >
                                None
                            </Button>
                        </Box>
                        <FormGroup
                            sx={{
                                display: "grid",
                                gridTemplateColumns: "repeat(4, 1fr)",
                            }}
                        >
                            {TYPES_EN.slice(start, end).map((type, i) => {
                                const idx = start + i;
                                return (
                                    <FormControlLabel
                                        key={idx}
                                        control={
                                            <Checkbox
                                                size="small"
                                                checked={
                                                    searcherFormState
                                                        .hiddenPowerTypes[idx]
                                                }
                                                onChange={(event) => {
                                                    const checked =
                                                        event.target.checked;
                                                    setSearcherFormState(
                                                        (data) => {
                                                            const next =
                                                                data.hiddenPowerTypes.slice();
                                                            next[idx] = checked;
                                                            return {
                                                                ...data,
                                                                hiddenPowerTypes:
                                                                    next,
                                                            };
                                                        }
                                                    );
                                                }}
                                            />
                                        }
                                        label={type}
                                    />
                                );
                            })}
                        </FormGroup>
                    </Box>
                ))}
            </Box>
            <NumericalInput
                label="Min Hidden Power BP (0–70, 0 disables)"
                name="minHiddenPowerStrength"
                margin="normal"
                minimumValue={0}
                maximumValue={70}
                isHex={false}
                value={searcherFormState.minHiddenPowerStrengthString}
                onChange={(_event, value) => {
                    setSearcherFormState((data) => ({
                        ...data,
                        minHiddenPowerStrengthString: value.value,
                    }));
                }}
            />
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
