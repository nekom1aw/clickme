import { Extension } from "@tiptap/core";
export const TableCellStyle = Extension.create({
  name: "tableCellStyle",
  addGlobalAttributes() {
    return [{ types: ["tableCell", "tableHeader"], attributes: {
      backgroundColor: { default: null, parseHTML: el => el.style.backgroundColor || null, renderHTML: attrs => attrs.backgroundColor ? { style: `background-color:${attrs.backgroundColor}` } : {} },
    } }];
  },
});
