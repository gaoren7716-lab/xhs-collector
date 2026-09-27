// modules/exporter.js —— Excel 导出（依赖 SheetJS 全局 XLSX）
window.Exporter = (function () {
  function toExcel(rows, filename, columns) {
    if (!rows || !rows.length) { alert('没有可导出的数据'); return; }
    const wsData = columns ? rows.map(r => {
      const o = {};
      columns.forEach(c => o[c.label] = r[c.key]);
      return o;
    }) : rows;
    const ws = XLSX.utils.json_to_sheet(wsData, columns ? { header: columns.map(c => c.label) } : undefined);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '数据');
    XLSX.writeFile(wb, filename || `xhs_export_${Date.now()}.xlsx`);
  }
  return { toExcel };
})();
