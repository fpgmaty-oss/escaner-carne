import * as XLSX from 'xlsx';
import { db } from './db';

export class ExportService {
  public async exportToExcel() {
    // 1. Fetch all data
    const boxes = await db.boxes.orderBy('timestamp').reverse().toArray();

    // 2. Format "Cajas" sheet
    const detailData = boxes.map(box => ({
      'ID Local': box.id,
      'Corte': box.cutName,
      'Peso Neto (kg)': box.netWeight,
      'Fecha y Hora': new Date(box.timestamp).toLocaleString(),
      'Corrección Manual': box.manualCorrection ? 'Sí' : 'No',
      'Estado': box.status
    }));

    const detailSheet = XLSX.utils.json_to_sheet(detailData);

    // 3. Format "Resumen" sheet
    const summaryMap = new Map<string, { count: number, totalWeight: number }>();
    boxes.forEach(box => {
      const current = summaryMap.get(box.cutName) || { count: 0, totalWeight: 0 };
      summaryMap.set(box.cutName, {
        count: current.count + 1,
        totalWeight: current.totalWeight + box.netWeight
      });
    });

    const summaryData = Array.from(summaryMap.entries()).map(([cut, data]) => ({
      'Corte': cut,
      'Cantidad de Cajas': data.count,
      'Peso Total (kg)': Number(data.totalWeight.toFixed(3))
    }));

    // Calculate Grand Total
    const grandTotalCount = summaryData.reduce((acc, curr) => acc + curr['Cantidad de Cajas'], 0);
    const grandTotalWeight = summaryData.reduce((acc, curr) => acc + curr['Peso Total (kg)'], 0);
    
    summaryData.push({
      'Corte': 'TOTAL',
      'Cantidad de Cajas': grandTotalCount,
      'Peso Total (kg)': Number(grandTotalWeight.toFixed(3))
    });

    const summarySheet = XLSX.utils.json_to_sheet(summaryData);

    // 4. Create Workbook and save
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, detailSheet, 'Detalle de Cajas');
    XLSX.utils.book_append_sheet(wb, summarySheet, 'Resumen por Corte');

    const dateStr = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `Escaneo_Carne_${dateStr}.xlsx`);
  }
}

export const exportService = new ExportService();
