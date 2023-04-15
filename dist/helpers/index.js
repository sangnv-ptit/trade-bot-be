"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatNumber = void 0;
const formatNumber = (num) => {
    const str = num.toString();
    const parts = str.split('.');
    return num.toFixed(8 - parts[0].length);
};
exports.formatNumber = formatNumber;
