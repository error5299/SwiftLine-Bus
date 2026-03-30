import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { format } from 'date-fns';
import { Trip, Booking, Passenger, Route, Bus, Counter, Crew } from '../types';

export const generateChallanPDF = async (
  trip: Trip,
  bookings: Booking[],
  passengers: Passenger[],
  route: Route | undefined,
  bus: Bus | undefined,
  counters: Counter[],
  crew: Crew[]
) => {
  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.width = '750px';
  container.style.backgroundColor = '#ffffff';
  container.style.fontFamily = "'Jost', sans-serif";
  container.style.padding = '30px';

  const tripCrew = (trip.crewIds || []).map(id => crew.find(c => c.id === id)).filter(Boolean);
  const driver = tripCrew.find(c => c?.role?.toLowerCase() === 'driver');
  const supervisor = tripCrew.find(c => c?.role?.toLowerCase() === 'supervisor');
  const helper = tripCrew.find(c => c?.role?.toLowerCase() === 'helper');

  const capacity = bus?.capacity || 40;
  const seatMap = new Map();
  bookings.filter(b => b.status === 'sold' || b.status === 'confirmed').forEach(b => {
    b.seats.forEach(seat => {
      seatMap.set(seat, b);
    });
  });

  const allSeats = Array.from({ length: capacity }, (_, i) => {
    const row = String.fromCharCode(65 + Math.floor(i / 4));
    const col = (i % 4) + 1;
    return `${row}${col}`;
  });

  let totalTaka = 0;
  const rows = allSeats.map((seat, index) => {
    const booking = seatMap.get(seat);
    const passenger = booking ? passengers.find(p => p.id === booking.passengerId) : null;
    const bCounter = booking ? counters.find(c => c.id === booking.boardingStopId) : null;
    const dCounter = booking ? counters.find(c => c.id === booking.droppingStopId) : null;
    
    if (booking) totalTaka += (booking.totalFare / booking.seats.length);

    return `
      <tr style="border-bottom: 1px solid #eee;">
        <td style="padding: 6px 4px; text-align: center; width: 30px;">${index + 1}</td>
        <td style="padding: 6px 4px; text-align: center; font-weight: 800; width: 50px;">${seat}</td>
        <td style="padding: 6px 4px; width: 150px;">${passenger?.name || '-'}</td>
        <td style="padding: 6px 4px; width: 100px;">${passenger?.phone || '-'}</td>
        <td style="padding: 6px 4px; width: 120px;">${bCounter?.name || '-'}</td>
        <td style="padding: 6px 4px; width: 120px;">${dCounter?.name || '-'}</td>
        <td style="padding: 6px 4px; text-align: right; width: 80px;">${booking ? (booking.totalFare / booking.seats.length).toLocaleString() : '-'}</td>
      </tr>
    `;
  }).join('');

  container.innerHTML = `
    <div style="color: #17252A; width: 690px; box-sizing: border-box; margin: 0 auto;">
      <div style="text-align: center; margin-bottom: 20px; border-bottom: 2px solid #DEF2F1; padding-bottom: 15px;">
        <h1 style="margin: 0; font-size: 36px; font-weight: 900; letter-spacing: -1px; text-transform: uppercase;">SwiftLine</h1>
        <p style="margin: 4px 0 0 0; font-size: 11px; font-weight: 600; color: #3AAFA9; letter-spacing: 4px; text-transform: uppercase;">Premium Travel Service • Comfort & Safety First</p>
      </div>

      <div style="display: flex; justify-content: space-between; margin-bottom: 20px; gap: 20px;">
        <div style="flex: 1;">
          <h2 style="margin: 0 0 10px 0; font-size: 18px; font-weight: 900; color: #17252A; border-left: 5px solid #3AAFA9; padding-left: 12px;">TRIP CHALLAN</h2>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 11px;">
            <p style="margin: 0;"><strong>Date:</strong> ${format(new Date(trip.departureTime), 'dd MMM yyyy')}</p>
            <p style="margin: 0;"><strong>Time:</strong> ${format(new Date(trip.departureTime), 'hh:mm a')}</p>
            <p style="margin: 0;"><strong>Coach No:</strong> ${trip.coachNumber}</p>
            <p style="margin: 0;"><strong>Route:</strong> ${route?.name || 'N/A'}</p>
            <p style="margin: 0; grid-column: span 2;"><strong>Bus:</strong> ${bus?.regNo || 'N/A'} (${bus?.isAC ? 'AC' : 'Non-AC'})</p>
          </div>
        </div>
        <div style="width: 260px; background: #f8fbfb; padding: 12px; border-radius: 12px; border: 1px solid #DEF2F1;">
          <h3 style="margin: 0 0 8px 0; font-size: 11px; font-weight: 800; color: #3AAFA9; text-transform: uppercase;">Crew Details</h3>
          <div style="font-size: 11px; line-height: 1.5;">
            <p style="margin: 0;"><strong>Driver:</strong> ${driver?.name || 'N/A'}</p>
            <p style="margin: 0;"><strong>Supervisor:</strong> ${supervisor?.name || 'N/A'}</p>
            <p style="margin: 0;"><strong>Helper:</strong> ${helper?.name || 'N/A'}</p>
          </div>
        </div>
      </div>

      <table style="width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 20px; table-layout: fixed;">
        <thead>
          <tr style="background: #17252A; color: #fff;">
            <th style="padding: 8px 4px; text-align: center; border-radius: 6px 0 0 0; width: 30px;">SL</th>
            <th style="padding: 8px 4px; text-align: center; width: 50px;">Seat</th>
            <th style="padding: 8px 4px; text-align: left; width: 150px;">Passenger Name</th>
            <th style="padding: 8px 4px; text-align: left; width: 100px;">Phone</th>
            <th style="padding: 8px 4px; text-align: left; width: 120px;">Boarding</th>
            <th style="padding: 8px 4px; text-align: left; width: 120px;">Dropping</th>
            <th style="padding: 8px 4px; text-align: right; border-radius: 0 6px 0 0; width: 80px;">Fare</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>

      <div style="display: flex; justify-content: flex-end; margin-top: 15px;">
        <div style="background: #17252A; color: #fff; padding: 12px 25px; border-radius: 12px; text-align: right; min-width: 180px;">
          <p style="margin: 0; font-size: 11px; font-weight: 600; color: #3AAFA9; text-transform: uppercase;">Total Collection</p>
          <p style="margin: 4px 0 0 0; font-size: 24px; font-weight: 900;">৳ ${totalTaka.toLocaleString()}</p>
        </div>
      </div>

      <div style="margin-top: 30px; padding-top: 15px; border-top: 1px dashed #ccc; text-align: center; font-size: 9px; color: #888;">
        <p>This is an official trip challan generated by SwiftLine Management System.</p>
        <p style="margin-top: 4px;">${new Date().toLocaleString()}</p>
      </div>
    </div>
  `;

  document.body.appendChild(container);

  try {
    // Add Jost font to the document if not present
    if (!document.getElementById('jost-font-link')) {
      const link = document.createElement('link');
      link.id = 'jost-font-link';
      link.href = 'https://fonts.googleapis.com/css2?family=Jost:wght@400;500;600;700;800;900&display=swap';
      link.rel = 'stylesheet';
      document.head.appendChild(link);
    }

    await new Promise(resolve => setTimeout(resolve, 1500));

    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false
    });

    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
    
    // Ensure it fits on one A4 page (297mm height)
    if (pdfHeight > 297) {
      const scaleFactor = 297 / pdfHeight;
      const scaledWidth = pdfWidth * scaleFactor;
      const xOffset = (pdfWidth - scaledWidth) / 2;
      pdf.addImage(imgData, 'PNG', xOffset, 0, scaledWidth, 297);
    } else {
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    }
    
    const pdfBlob = pdf.output('blob');
    return URL.createObjectURL(pdfBlob);
  } catch (error) {
    console.error('Error generating Challan PDF:', error);
    throw error;
  } finally {
    document.body.removeChild(container);
  }
};
