import { useState } from "react";

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
    STATIC_2,
    STATIC_4,
} from "../tenLines";
import NumericalInput from "./NumericalInput";
import { proxy } from "comlink";
import {
    type ExtendedSearcherState,
    type ExtendedWildSearcherState,
} from "../tenLines/generated";
import React from "react";
import {
    GENDERS_EN,
    METHODS_EN,
    NATURES_EN,
    TYPES_EN,
} from "../tenLines/resources";
import IvEntry from "./IvEntry";
import StaticEncounterSelector from "./StaticEncounterSelector";
import { useSearchParams } from "react-router-dom";
import WildEncounterSelector from "./WildEncounterSelector";
import SearcherTable, { type EnrichedSearcherRow } from "./SearcherTable";

export interface SearcherFormState {
    shininess: number;
    natures: boolean[];
    gender: number;
    hiddenPower: number;
    minHiddenPowerStrengthString: string;
    ivRangeStrings: [string, string][];
    staticCategory: number;
    staticPokemon: number;
    wildCategory: number;
    wildLocation: number;
    wildPokemon: number;
    wildLead: number;
    method: number;
}

export interface SearcherURLState {
    game: string;
    trainerID: string;
    secretID: string;
    gameConsole: string;
}

function useSearcherURLState() {
    const [searchParams, setSearchParams] = useSearchParams();
    const game = searchParams.get("game") || "r_painting";
    const trainerID = searchParams.get("trainerID") || "0";
    const secretID = searchParams.get("secretID") || "0";
    const gameConsole = fixGameConsole(game, searchParams.get("gameConsole") || "GBA");
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
    const [searcherFormState, setSearcherFormState] =
        useState<SearcherFormState>({
            shininess: 255,
            natures: Array(NATURES_EN.length).fill(true),
            gender: 255,
            hiddenPower: -1,
            minHiddenPowerStrengthString: "30",
            ivRangeStrings: [
                ["0", "31"],
                ["0", "31"],
                ["0", "31"],
                ["0", "31"],
                ["0", "31"],
                ["0", "31"],
            ],
            staticCategory: 0,
            staticPokemon: 0,
            wildCategory: 0,
            wildLocation: 0,
            wildPokemon: 0,
            wildLead: 255,
            method: 1,
        });
    const { game, trainerID, secretID, gameConsole, setSearcherURLState } =
        useSearcherURLState();

    const [rawRows, setRawRows] = useState<
        (ExtendedSearcherState | ExtendedWildSearcherState)[]
    >([]);
    const [enrichedRows, setEnrichedRows] = useState<EnrichedSearcherRow[]>([]);
    const [searching, setSearching] = useState(false);
    const [enriching, setEnriching] = useState(false);

    const [ivRangesAreValid, setIvRangesAreValid] = useState(true);
    const ivRanges = ivRangesAreValid
        ? searcherFormState.ivRangeStrings.map((range) => [
            parseInt(range[0], 10),
            parseInt(range[1], 10),
        ])
        : [];

    const [trainerIDIsValid, setTrainerIDIsValid] = useState(true);
    const [secretIDIsValid, setSecretIDIsValid] = useState(true);

    const isNotSubmittable =
        searching || !trainerIDIsValid || !secretIDIsValid || !ivRangesAreValid;

    const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (isNotSubmittable) return;
        const { natures } = searcherFormState;
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
            row.hiddenPowerStrength >= minHiddenPowerStrength;

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
            const onDone = async (stillSearching: boolean) => {
                setSearching(stillSearching);
                if (stillSearching) return;
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

            if (isStatic) {
                await tenLines.search_seeds_static(
                    SEED_IDENTIFIER_TO_GAME[game],
                    parseInt(trainerID),
                    parseInt(secretID),
                    searcherFormState.staticCategory,
                    searcherFormState.staticPokemon,
                    searcherFormState.method,
                    searcherFormState.shininess,
                    -1,
                    searcherFormState.gender,
                    searcherFormState.hiddenPower,
                    ivRanges,
                    proxy(appendBatch),
                    proxy(onDone)
                );
            } else {
                await tenLines.search_seeds_wild(
                    SEED_IDENTIFIER_TO_GAME[game],
                    parseInt(trainerID),
                    parseInt(secretID),
                    searcherFormState.wildCategory,
                    searcherFormState.wildLocation,
                    searcherFormState.wildPokemon,
                    searcherFormState.method,
                    searcherFormState.wildLead,
                    searcherFormState.shininess,
                    -1,
                    searcherFormState.gender,
                    searcherFormState.hiddenPower,
                    ivRanges,
                    proxy(appendBatch),
                    proxy(onDone)
                );
            }
        };
        submit();
    };

    const isStatic = searcherFormState.method <= STATIC_4;
    const isFRLG = game.startsWith("fr") || game.startsWith("lg");
    const isFRLGE = isFRLG || game.startsWith("e_");

    if (searcherFormState.staticCategory == 3 && !isFRLG) {
        searcherFormState.staticCategory = 0;
        setSearcherFormState(searcherFormState);
    }
    if (searcherFormState.staticCategory == 6 && !isFRLGE) {
        searcherFormState.staticCategory = 0;
        setSearcherFormState(searcherFormState);
    }
    if (searcherFormState.staticCategory == 8 && isFRLG) {
        searcherFormState.staticCategory = 0;
        setSearcherFormState(searcherFormState);
    }

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
            <TextField
                label="Method"
                margin="normal"
                style={{ textAlign: "left" }}
                onChange={(event) => {
                    setSearcherFormState((data) => ({
                        ...data,
                        method: parseInt(event.target.value),
                    }));
                }}
                value={searcherFormState.method}
                select
                fullWidth
            >
                {Object.entries(METHODS_EN)
                    .filter(([value, _name]) => parseInt(value) != STATIC_2)
                    .map(([value, name], index) => (
                        <MenuItem key={index} value={parseInt(value)}>
                            {name}
                        </MenuItem>
                    ))}
            </TextField>
            {isStatic && (
                <StaticEncounterSelector
                    staticCategory={searcherFormState.staticCategory}
                    staticPokemon={searcherFormState.staticPokemon}
                    game={SEED_IDENTIFIER_TO_GAME[game]}
                    onChange={(staticCategory, staticPokemon) => {
                        setSearcherFormState((data) => ({
                            ...data,
                            staticCategory,
                            staticPokemon,
                        }));
                    }}
                />
            )}
            {!isStatic && (
                <WildEncounterSelector
                    wildCategory={searcherFormState.wildCategory}
                    wildLocation={searcherFormState.wildLocation}
                    wildPokemon={searcherFormState.wildPokemon}
                    wildLead={searcherFormState.wildLead}
                    game={SEED_IDENTIFIER_TO_GAME[game]}
                    onChange={(
                        wildCategory,
                        wildLocation,
                        wildPokemon,
                        wildLead,
                        _
                    ) => {
                        setSearcherFormState((data) => ({
                            ...data,
                            wildCategory,
                            wildLocation,
                            wildPokemon,
                            wildLead,
                        }));
                    }}
                    shouldFilterPokemon={true}
                    allowAnyPokemon
                    isSearcher
                />
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
                <FormGroup
                    sx={{
                        display: "grid",
                        gridTemplateColumns: "repeat(5, 1fr)",
                    }}
                >
                    {NATURES_EN.map((nature, index) => (
                        <FormControlLabel
                            key={index}
                            control={
                                <Checkbox
                                    size="small"
                                    checked={searcherFormState.natures[index]}
                                    onChange={(event) => {
                                        const checked = event.target.checked;
                                        setSearcherFormState((data) => {
                                            const next = data.natures.slice();
                                            next[index] = checked;
                                            return { ...data, natures: next };
                                        });
                                    }}
                                />
                            }
                            label={nature}
                        />
                    ))}
                </FormGroup>
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
            <TextField
                label="Hidden Power"
                margin="normal"
                style={{ textAlign: "left" }}
                onChange={(event) => {
                    setSearcherFormState((data) => ({
                        ...data,
                        hiddenPower: parseInt(event.target.value),
                    }));
                }}
                value={searcherFormState.hiddenPower}
                select
                fullWidth
            >
                <MenuItem value="-1">Any</MenuItem>
                {TYPES_EN.map((type, index) => (
                    <MenuItem key={index} value={index}>
                        {type}
                    </MenuItem>
                ))}
            </TextField>
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
                isStatic={isStatic}
                isFRLG={isFRLG}
                gameConsole={gameConsole}
                isMultiMethod={
                    searcherFormState.method === COMBINED_WILD_METHOD
                }
            />
        </Box>
    );
}
