export const VERIFIED_MOVE_SOURCES = {
  U: "user reference image: U after one turn, CIF view",
  R: "user reference image: R after one turn, CIF/EIF view",
  F: "user reference image: F after one turn, CIF/EIF view",
  B: "user reference image: B after one turn, CIF/EIF view"
};

export const FACE_ADJACENCY_DRAFT = {
  U: ["B", "R", "F", "L"],
  D: ["F", "R", "B", "L"],
  R: ["U", "F", "D", "BR"],
  BL: ["U", "BR", "D", "F"],
  F: ["U", "L", "D", "R"],
  B: ["U", "BR", "D", "BL"],
  L: ["U", "B", "D", "F"],
  BR: ["U", "R", "D", "B"]
};

export const BACK_VIEW_FACES = ["B", "BR", "D", "BL"];

export const MOVE_TABLE_STATUS = {
  state: "draft",
  note: [
    "Sticker IDs can now be shown in the UI.",
    "Use the U/R/F/B reference images to map visible sticker IDs to physical cycles.",
    "B, BR, D, and BL need back-view mirrored index handling before final permutation."
  ]
};
