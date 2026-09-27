// Shared app state: the list of life areas (loaded from the backend) and a
// way for any screen to ask "please redraw the current page".
export const state = {
  areas: [],      // [{id, name, color, icon}]
  areaById: {},
  refresh: () => {},
};

export function setAreas(areas) {
  state.areas = areas;
  state.areaById = Object.fromEntries(areas.map((a) => [a.id, a]));
}
