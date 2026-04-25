import Paper from "@mui/material/Paper";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";
import { memo } from "react";
import { hexSeed, type EarliestReach } from "../tenLines";
import type {
    ExtendedSearcherState,
    ExtendedWildSearcherState,
} from "../tenLines/generated";
import {
    ABILITIES_EN,
    GENDERS_EN,
    getNameEn,
    METHODS_EN,
    NATURES_EN,
    SHININESS_EN,
    TYPES_EN,
} from "../tenLines/resources";
import { useSearchParams } from "react-router-dom";
import { Button } from "@mui/material";

dayjs.extend(duration);

export type EnrichedSearcherRow = (
    | ExtendedSearcherState
    | ExtendedWildSearcherState
) & {
    earliest?: EarliestReach | null;
};

function humanizeSettings(settings: string | undefined) {
    if (!settings) return "";
    const [
        sound,
        buttonMode,
        active_button,
        held_button_modifier,
        held_button,
    ] = settings.split("_");
    const humanizedTerms: Record<string, string> = {
        stereo: "Stereo",
        mono: "Mono",
        start: "Start",
        select: "Select",
        a: "A",
        l: "L",
        r: "R",
        startup: "Startup",
        blackout: "Blackout",
        al: "A+L",
        none: "None",
        undefined: "",
    };
    const humanizedButtonModes: Record<string, string> = {
        a: "L=A",
        h: "Help",
        r: "LR",
    };
    return `${humanizedTerms[sound]} | ${humanizedButtonModes[buttonMode]} | Seed Button: ${humanizedTerms[active_button]} | Extra Button: ${humanizedTerms[held_button_modifier]} ${humanizedTerms[held_button]}`;
}

function formatMs(totalMs: number) {
    const d = dayjs.duration(totalMs);
    if (d.days() > 0) {
        return `${Math.floor(d.asHours())}:${d.format("mm:ss.SSS")}`;
    }
    return d.format("HH:mm:ss.SSS");
}

const SearcherTable = memo(function SearcherTable({
    rows,
    isStatic,
    isFRLG,
    gameConsole,
    isMultiMethod,
}: {
    rows: EnrichedSearcherRow[];
    isStatic: boolean;
    isFRLG: boolean;
    gameConsole: string;
    isMultiMethod: boolean;
}) {
    const [_, setSearchParams] = useSearchParams();

    function openInInitialSeed(
        row: ExtendedSearcherState | ExtendedWildSearcherState,
        isAuxClick: boolean
    ) {
        setSearchParams((previous) => {
            let params = new URLSearchParams(previous);
            params.set("targetSeed", hexSeed(row.seed, 32));
            params.set("page", "0");
            if (isAuxClick) {
                window.open(`?${params.toString()}`);
                return previous;
            }
            return params;
        });
    }
    return (
        <TableContainer component={Paper}>
            <Table>
                <TableHead>
                    <TableRow>
                        <TableCell>Seed</TableCell>
                        {isMultiMethod && <TableCell>Method</TableCell>}
                        {!isStatic && <TableCell>Slot</TableCell>}
                        {!isStatic && <TableCell>Level</TableCell>}
                        <TableCell>PID</TableCell>
                        <TableCell>Shiny</TableCell>
                        <TableCell>Nature</TableCell>
                        <TableCell>Ability</TableCell>
                        <TableCell>IVs</TableCell>
                        <TableCell>Hidden</TableCell>
                        <TableCell>Power</TableCell>
                        <TableCell>Gender</TableCell>
                        <TableCell>Earliest Time ({gameConsole})</TableCell>
                        <TableCell>Advances</TableCell>
                        {isFRLG && <TableCell>Settings</TableCell>}
                        <TableCell>Open In Initial Seed</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {rows.map((row, index) => {
                        if (index === 1000) {
                            return <TableRow key={index}>...</TableRow>;
                        } else if (index > 1000) {
                            return null;
                        }
                        const earliest = row.earliest;
                        return (
                            <TableRow key={index}>
                                <TableCell>{hexSeed(row.seed, 32)}</TableCell>
                                {isMultiMethod && (
                                    <TableCell>
                                        {
                                            METHODS_EN[
                                                (
                                                    row as ExtendedWildSearcherState
                                                ).method
                                            ]
                                        }
                                    </TableCell>
                                )}
                                {!isStatic && (
                                    <TableCell>
                                        {
                                            (row as ExtendedWildSearcherState)
                                                .encounterSlot
                                        }
                                        :{" "}
                                        {getNameEn(
                                            (row as ExtendedWildSearcherState)
                                                .species,
                                            (row as ExtendedWildSearcherState)
                                                .form
                                        )}
                                    </TableCell>
                                )}
                                {!isStatic && (
                                    <TableCell>
                                        {
                                            (row as ExtendedWildSearcherState)
                                                .level
                                        }
                                    </TableCell>
                                )}
                                <TableCell>{hexSeed(row.pid, 32)}</TableCell>
                                <TableCell>{SHININESS_EN[row.shiny]}</TableCell>
                                <TableCell>{NATURES_EN[row.nature]}</TableCell>
                                <TableCell>
                                    {row.ability}:{" "}
                                    {ABILITIES_EN[row.abilityIndex - 1]}
                                </TableCell>
                                <TableCell>{row.ivs.join("/")}</TableCell>
                                <TableCell>
                                    {TYPES_EN[row.hiddenPower]}
                                </TableCell>
                                <TableCell>{row.hiddenPowerStrength}</TableCell>
                                <TableCell>{GENDERS_EN[row.gender]}</TableCell>
                                <TableCell>
                                    {earliest
                                        ? formatMs(earliest.totalMs)
                                        : earliest === null
                                            ? "—"
                                            : "…"}
                                </TableCell>
                                <TableCell>
                                    {earliest ? earliest.advances : ""}
                                </TableCell>
                                {isFRLG && (
                                    <TableCell>
                                        {earliest
                                            ? humanizeSettings(earliest.settings)
                                            : ""}
                                    </TableCell>
                                )}
                                <TableCell>
                                    <Button
                                        variant="contained"
                                        size="small"
                                        onClick={() => {
                                            openInInitialSeed(row, false);
                                        }}
                                        onMouseDown={(e) => {
                                            if (e.button === 1) {
                                                e.preventDefault();
                                                openInInitialSeed(row, true);
                                            }
                                        }}
                                    >
                                        Initial Seed
                                    </Button>
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
        </TableContainer>
    );
});

export default SearcherTable;
