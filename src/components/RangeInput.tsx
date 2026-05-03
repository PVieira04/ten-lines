import { Box, Button } from "@mui/material";
import { useState } from "react";
import NumericalInput from "./NumericalInput";

function RangeInput({
    label,
    name,
    value,
    minimumValue,
    maximumValue,
    onChange,
    resetButton = false,
    allowEmpty = false,
    minPlaceholder,
    maxPlaceholder,
    ...props
}: {
    label: string;
    name: string;
    value: [string, string];
    minimumValue: number;
    maximumValue: number;
    onChange: (
        event: React.ChangeEvent<HTMLInputElement>,
        value: {
            isValid: boolean;
            value: [string, string];
        }
    ) => void;
    resetButton?: boolean;
    allowEmpty?: boolean;
    minPlaceholder?: string;
    maxPlaceholder?: string;
    [key: string]: any;
}) {
    const [minValid, setMinValid] = useState(true);
    const [maxValid, setMaxValid] = useState(true);
    const effMin = (s: string) =>
        allowEmpty && s === "" ? minimumValue : parseInt(s);
    const effMax = (s: string) =>
        allowEmpty && s === "" ? maximumValue : parseInt(s);
    const minChange = (
        event: React.ChangeEvent<HTMLInputElement>,
        { value: newMin, isValid: newMinValid }: { value: string; isValid: boolean }
    ) => {
        setMinValid(newMinValid);
        const maxN = effMax(value[1]);
        const newMinN = effMin(newMin);
        const newMaxValid = newMinValid
            ? maxN >= newMinN && maxN <= maximumValue
            : maxValid;
        if (newMaxValid !== maxValid) setMaxValid(newMaxValid);
        onChange(event, {
            value: [newMin, value[1]],
            isValid: newMinValid && newMaxValid,
        });
    };
    const maxChange = (
        event: React.ChangeEvent<HTMLInputElement>,
        { value: newMax, isValid: newMaxValid }: { value: string; isValid: boolean }
    ) => {
        setMaxValid(newMaxValid);
        const minN = effMin(value[0]);
        const newMaxN = effMax(newMax);
        const newMinValid = newMaxValid
            ? minN >= minimumValue && minN <= newMaxN
            : minValid;
        if (newMinValid !== minValid) setMinValid(newMinValid);
        onChange(event, {
            value: [value[0], newMax],
            isValid: newMinValid && newMaxValid,
        });
    };

    return (
        <Box sx={{ display: "flex" }}>
            <NumericalInput
                label={`Minimum ${label}`}
                name={name}
                minimumValue={minimumValue}
                maximumValue={maxValid ? effMax(value[1]) : maximumValue}
                onChange={minChange}
                value={value[0]}
                allowEmpty={allowEmpty}
                placeholder={minPlaceholder}
                {...props}
            />
            <span
                style={{
                    margin: "0 10px",
                    alignSelf: "center",
                }}
            >
                -
            </span>
            <NumericalInput
                label={`Maximum ${label}`}
                name={name}
                minimumValue={minValid ? effMin(value[0]) : minimumValue}
                maximumValue={maximumValue}
                onChange={maxChange}
                value={value[1]}
                allowEmpty={allowEmpty}
                placeholder={maxPlaceholder}
                {...props}
            />
            {resetButton && (
                <Button
                    onClick={(e) => {
                        setMinValid(true);
                        setMaxValid(true);
                        // TODO: this is hacky but nothing currently actually cares about the event
                        onChange(e as any, {
                            value: allowEmpty
                                ? ["", ""]
                                : [
                                      minimumValue.toString(),
                                      maximumValue.toString(),
                                  ],
                            isValid: true,
                        });
                    }}
                    size="large"
                    sx={{
                        maxWidth: "35px",
                        minWidth: "35px",
                    }}
                >
                    ↻
                </Button>
            )}
        </Box>
    );
}

export default RangeInput;
