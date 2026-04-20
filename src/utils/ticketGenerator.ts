import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { format } from 'date-fns';
import QRCode from 'qrcode';
import { Booking, Trip, Route, Counter, Bus, Passenger } from '../types';

export const getTicketHTML = async (
  booking: Booking,
  trip: Trip | undefined,
  route: Route | undefined,
  boarding: Counter | undefined,
  dropping: Counter | undefined,
  bus: Bus | undefined,
  passengerData: Partial<Passenger> | undefined,
  qrCodeElementId: string = 'ticket-qrcode'
) => {
  let qrCodeImg = '';
  try {
    // Generate QR code directly using the qrcode library for better reliability
    qrCodeImg = await QRCode.toDataURL(booking.id, {
      margin: 1,
      width: 400,
      color: {
        dark: '#17252A',
        light: '#FEFFFF'
      }
    });
  } catch (err) {
    console.error('QR Code generation failed:', err);
    // Fallback to DOM canvas if library fails for some reason
    const canvas = document.getElementById(qrCodeElementId) as HTMLCanvasElement;
    if (canvas) {
      qrCodeImg = canvas.toDataURL('image/png');
    }
  }

  const formattedDate = trip ? format(new Date(trip.departureTime), 'dd MMM yyyy') : 'N/A';
  const depTime = trip ? format(new Date(trip.departureTime), 'hh:mm a') : 'N/A';
  const bookingDate = format(new Date(booking.timestamp), 'dd MMM yyyy, hh:mm a');

  return `
    <div style="padding: 0; margin: 0; width: 1000px; height: 400px; background-color: #ffffff; font-family: 'Jost', sans-serif; display: flex; color: #17252A; border-radius: 30px; overflow: hidden; box-shadow: 0 40px 100px rgba(0,0,0,0.1); border: 1px solid #f0f0f0;">
      
      <!-- Main Ticket Body -->
      <div style="flex: 1; padding: 40px; display: flex; flex-direction: column; position: relative;">
        
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 40px;">
          <div style="display: flex; align-items: center; gap: 15px;">
            <div style="width: 45px; height: 45px; bg-color: #17252A; background: #17252A; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: #white; font-weight: 900; font-size: 20px; color: white;">SL</div>
            <div style="display: flex; flex-direction: column;">
              <span style="font-size: 24px; font-weight: 900; letter-spacing: -1px; text-transform: uppercase;">SwiftLine</span>
              <span style="font-size: 9px; font-weight: 800; color: #3AAFA9; text-transform: uppercase; letter-spacing: 3px;">Premium Fleet</span>
            </div>
          </div>
          <div style="text-align: right;">
            <span style="font-size: 10px; font-weight: 800; color: #3AAFA9; text-transform: uppercase; letter-spacing: 2px;">Boarding Pass</span>
            <div style="font-size: 32px; font-weight: 900; letter-spacing: -2px; color: #17252A; margin-top: -5px;">E-TICKET</div>
          </div>
        </div>

        <!-- Info Grid -->
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 30px; flex: 1;">
          
          <div style="display: flex; flex-direction: column; gap: 5px;">
             <span style="font-size: 9px; font-weight: 800; color: #888; text-transform: uppercase; letter-spacing: 1px;">Passenger Name</span>
             <span style="font-size: 16px; font-weight: 800; color: #17252A;">${passengerData?.name || 'Valued Customer'}</span>
          </div>

          <div style="display: flex; flex-direction: column; gap: 5px;">
             <span style="font-size: 9px; font-weight: 800; color: #888; text-transform: uppercase; letter-spacing: 1px;">Coach No.</span>
             <span style="font-size: 16px; font-weight: 800; color: #17252A;">${trip?.coachNumber || 'N/A'}</span>
          </div>

          <div style="display: flex; flex-direction: column; gap: 5px;">
             <span style="font-size: 9px; font-weight: 800; color: #888; text-transform: uppercase; letter-spacing: 1px;">Seat(s)</span>
             <span style="font-size: 18px; font-weight: 900; color: #3AAFA9;">${booking.seats.join(', ')}</span>
          </div>

          <div style="display: flex; flex-direction: column; gap: 5px;">
             <span style="font-size: 9px; font-weight: 800; color: #888; text-transform: uppercase; letter-spacing: 1px;">Trip Date</span>
             <span style="font-size: 16px; font-weight: 800; color: #17252A;">${formattedDate}</span>
          </div>

          <div style="grid-column: span 2; display: flex; flex-direction: column; gap: 5px;">
             <span style="font-size: 9px; font-weight: 800; color: #888; text-transform: uppercase; letter-spacing: 1px;">From (Origin)</span>
             <span style="font-size: 15px; font-weight: 800; color: #17252A;">${boarding?.name || 'N/A'}</span>
          </div>

          <div style="grid-column: span 2; display: flex; flex-direction: column; gap: 5px;">
             <span style="font-size: 9px; font-weight: 800; color: #888; text-transform: uppercase; letter-spacing: 1px;">To (Destination)</span>
             <span style="font-size: 15px; font-weight: 800; color: #17252A;">${dropping?.name || 'N/A'}</span>
          </div>

          <div style="display: flex; flex-direction: column; gap: 5px;">
             <span style="font-size: 9px; font-weight: 800; color: #888; text-transform: uppercase; letter-spacing: 1px;">Departure</span>
             <span style="font-size: 16px; font-weight: 800; color: #17252A;">${depTime}</span>
          </div>

          <div style="display: flex; flex-direction: column; gap: 5px;">
             <span style="font-size: 9px; font-weight: 800; color: #888; text-transform: uppercase; letter-spacing: 1px;">Reporting Time</span>
             <span style="font-size: 16px; font-weight: 800; color: #3AAFA9;">${trip ? format(new Date(new Date(trip.departureTime).getTime() - 20 * 60000), 'hh:mm a') : 'N/A'}</span>
          </div>

          <div style="display: flex; flex-direction: column; gap: 5px;">
             <span style="font-size: 9px; font-weight: 800; color: #888; text-transform: uppercase; letter-spacing: 1px;">Price Paid</span>
             <span style="font-size: 18px; font-weight: 900; color: #17252A;">৳ ${booking.totalFare}</span>
          </div>

          <div style="display: flex; flex-direction: column; gap: 5px;">
             <span style="font-size: 9px; font-weight: 800; color: #888; text-transform: uppercase; letter-spacing: 1px;">PNR Number</span>
             <span style="font-size: 16px; font-weight: 800; color: #17252A;">${booking.id}</span>
          </div>
        </div>

        <!-- Perforation line -->
        <div style="position: absolute; right: 0; top: 0; bottom: 0; width: 2px; height: 100%; border-right: 2px dashed #f0f0f0;">
          <div style="position: absolute; top: -15px; left: -14px; width: 30px; height: 30px; background: #FEFFFF; border-radius: 50%;"></div>
          <div style="position: absolute; bottom: -15px; left: -14px; width: 30px; height: 30px; background: #FEFFFF; border-radius: 50%;"></div>
        </div>

      </div>

      <!-- Tear-off Section (Stub) -->
      <div style="width: 250px; background-color: #fcfcfc; padding: 40px; display: flex; flex-direction: column; align-items: center; justify-content: space-between; border-left: 1px solid #f0f0f0;">
        
        <div style="text-align: center; width: 100%;">
          <span style="font-size: 10px; font-weight: 800; color: #ccc; text-transform: uppercase; letter-spacing: 4px; display: block; margin-bottom: 20px;">Verification</span>
          <div style="background: white; padding: 10px; border-radius: 20px; border: 1px solid #f0f0f0; margin-bottom: 20px;">
            ${qrCodeImg ? `<img src="${qrCodeImg}" style="width: 140px; height: 140px;" />` : '<div style="width: 140px; height: 140px; background: #eee;"></div>'}
          </div>
          <div style="display: flex; flex-direction: column; gap: 2px;">
            <span style="font-size: 18px; font-weight: 900; color: #17252A;">${booking.seats.join(', ')}</span>
            <span style="font-size: 9px; font-weight: 800; color: #3AAFA9; text-transform: uppercase; letter-spacing: 1px;">Seat ID</span>
          </div>
        </div>

        <div style="text-align: center;">
          <span style="font-size: 10px; font-weight: 800; color: #17252A; text-transform: uppercase; letter-spacing: 1px;">${booking.id}</span>
          <p style="font-size: 8px; color: #999; margin: 5px 0 0 0;">Scan to check-in</p>
        </div>

      </div>

    </div>
  `;
};

export const printTicketHTML = async (
  booking: Booking,
  trip: Trip | undefined,
  route: Route | undefined,
  boarding: Counter | undefined,
  dropping: Counter | undefined,
  bus: Bus | undefined,
  passengerData: Partial<Passenger> | undefined,
  qrCodeElementId: string = 'ticket-qrcode'
) => {
  const htmlContent = await getTicketHTML(booking, trip, route, boarding, dropping, bus, passengerData, qrCodeElementId);
  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(`
      <html>
        <head>
          <title>Print Ticket - ${booking.id}</title>
          <link href="https://fonts.googleapis.com/css2?family=Jost:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
          <style>
            body { margin: 0; padding: 20px; display: flex; justify-content: center; }
            @media print {
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; padding: 0; }
              @page { margin: 0; }
            }
          </style>
        </head>
        <body>
          ${htmlContent}
          <script>
            window.onload = () => {
              setTimeout(() => {
                window.print();
                window.close();
              }, 500);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  } else {
    alert('Please allow popups to print the ticket.');
  }
};

export const generateTicketPDF = async (
  booking: Booking,
  trip: Trip | undefined,
  route: Route | undefined,
  boarding: Counter | undefined,
  dropping: Counter | undefined,
  bus: Bus | undefined,
  passengerData: Partial<Passenger> | undefined,
  qrCodeElementId: string = 'ticket-qrcode'
) => {
  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.innerHTML = await getTicketHTML(booking, trip, route, boarding, dropping, bus, passengerData, qrCodeElementId);

  document.body.appendChild(container);

  try {
    // Wait a brief moment to ensure fonts are applied
    await new Promise(resolve => setTimeout(resolve, 500));

    const canvas = await html2canvas(container, {
      scale: 2, // Higher resolution
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false
    });

    const imgData = canvas.toDataURL('image/png');
    
    const pdfWidth = 210;
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

    const pdf = new jsPDF({
      orientation: pdfWidth > pdfHeight ? 'landscape' : 'portrait',
      unit: 'mm',
      format: [pdfWidth, pdfHeight]
    });

    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    pdf.save(`SwiftLine_Ticket_${booking.id}.pdf`);
  } catch (error) {
    console.error('Error generating PDF:', error);
    alert('Failed to generate PDF. Please try again.');
  } finally {
    document.body.removeChild(container);
  }
};
