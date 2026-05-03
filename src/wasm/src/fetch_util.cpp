#include "blisy_events.hpp"
#include "pokefinder_glue.hpp"
#include "util.hpp"
#include <Core/Gen3/EncounterArea3.hpp>
#include <Core/Gen3/Encounters3.hpp>
#include <Core/Gen3/StaticTemplate3.hpp>
#include <Core/Global.hpp>
#include <algorithm>
#include <emscripten.h>
#include <emscripten/bind.h>
#include <vector>

emscripten::typed_array<u16> get_wild_locations(u32 game, u8 encounter_category)
{
    EncounterSettings3 settings;
    std::vector<EncounterArea3> encounter_areas = Encounters3::getEncounters(Encounter(encounter_category), settings, Game(game));
    std::vector<u16> locs;
    std::transform(encounter_areas.begin(), encounter_areas.end(), std::back_inserter(locs),
        [](const EncounterArea3& area) { return area.getLocation(); });
    return locs;
}

emscripten::typed_array<u16> get_area_species(u32 game, u8 encounter_category, u16 location)
{
    EncounterSettings3 settings;
    auto encounter_areas = Encounters3::getEncounters(Encounter(encounter_category), settings, Game(game));
    EncounterArea3 area = encounter_areas[location];
    return area.getUniqueSpecies();
}

emscripten::typed_array<EnumeratedStaticTemplate3> get_static_template_info(int category)
{
    if (category == BlisyEvents::CATEGORY) {
        return BlisyEvents::get_template_info();
    }

    int size;
    const StaticTemplate3* templates = Encounters3::getStaticEncounters(category, &size);
    emscripten::typed_array<EnumeratedStaticTemplate3> array;

    for (int i = 0; i < size; i++) {
        array.push_back(EnumeratedStaticTemplate3(i, templates[i]));
    }
    return array;
}

emscripten::typed_array<EncounterRef> get_encounters_for_species(u32 game, u16 specie)
{
    emscripten::typed_array<EncounterRef> result;
    EncounterSettings3 settings;

    static constexpr u8 wild_categories[] = { 0, 3, 4, 6, 7, 8 };
    for (u8 cat : wild_categories) {
        auto areas = Encounters3::getEncounters(Encounter(cat), settings, Game(game));
        for (size_t i = 0; i < areas.size(); i++) {
            auto species = areas[i].getUniqueSpecies();
            bool matched = false;
            for (u16 sf : species) {
                if ((sf & 0x7ff) == specie) {
                    matched = true;
                    break;
                }
            }
            if (matched) {
                result.push_back({ 0, cat, static_cast<int>(i) });
            }
        }
    }

    static constexpr int static_categories[] = { 0, 1, 2, 3, 4, 5, 6, 7 };
    for (int cat : static_categories) {
        int size;
        const StaticTemplate3* templates = Encounters3::getStaticEncounters(cat, &size);
        for (int i = 0; i < size; i++) {
            const StaticTemplate3& t = templates[i];
            if (t.getSpecie() == specie
                && (static_cast<u32>(t.getVersion()) & game) != 0) {
                result.push_back({ 1, static_cast<u8>(cat), i });
            }
        }
    }

    for (int i = 0; i < BlisyEvents::COUNT; i++) {
        const EnumeratedStaticTemplate3* t = BlisyEvents::get_template(i);
        if (t->getSpecie() == specie
            && (static_cast<u32>(t->getVersion()) & game) != 0) {
            result.push_back({ 1, static_cast<u8>(BlisyEvents::CATEGORY), t->index });
        }
    }

    return result;
}

EMSCRIPTEN_BINDINGS(fetch_util)
{
    emscripten::smart_function("get_wild_locations", &get_wild_locations);
    emscripten::smart_function("get_area_species", &get_area_species);
    emscripten::smart_function("get_static_template_info", &get_static_template_info);
    emscripten::smart_function("get_encounters_for_species", &get_encounters_for_species);
}