import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { format } from 'date-fns';
import { Booking, Trip, Route, Counter, Bus, Passenger } from '../types';

export const getTicketHTML = (
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
  const canvas = document.getElementById(qrCodeElementId) as HTMLCanvasElement;
  if (canvas) {
    qrCodeImg = canvas.toDataURL('image/png');
  }

  const formattedDate = trip ? format(new Date(trip.departureTime), 'dd MMM yyyy, hh:mm a') : 'N/A';
  const bookingDate = format(new Date(booking.timestamp), 'dd MMM yyyy, hh:mm a');

  return `
    <div style="padding: 40px; border: 2px solid #DEF2F1; border-radius: 24px; margin: 20px; position: relative; overflow: hidden; width: 800px; background-color: #FEFFFF; font-family: 'Jost', sans-serif; color: #17252A;">
      <!-- Decorative Background Elements -->
      <div style="position: absolute; top: -50px; right: -50px; width: 200px; height: 200px; background: #DEF2F1; border-radius: 50%; opacity: 0.5;"></div>
      <div style="position: absolute; bottom: -100px; left: -50px; width: 300px; height: 300px; background: #3AAFA9; border-radius: 50%; opacity: 0.05;"></div>
      
      <!-- Header -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px dashed #DEF2F1; padding-bottom: 24px; margin-bottom: 24px; position: relative; z-index: 10;">
        <div>
          <h1 style="margin: 0; font-size: 36px; font-weight: 900; color: #17252A; letter-spacing: -1px; text-transform: uppercase;">SwiftLine</h1>
          <p style="margin: 4px 0 0 0; font-size: 14px; font-weight: 600; color: #3AAFA9; text-transform: uppercase; letter-spacing: 2px;">Premium Travel</p>
        </div>
        <div style="text-align: right;">
          <div style="background: #17252A; color: #FEFFFF; padding: 8px 16px; border-radius: 8px; font-weight: 800; font-size: 14px; display: inline-block; margin-bottom: 8px; letter-spacing: 1px;">E-TICKET</div>
          <p style="margin: 0; font-size: 12px; font-weight: 600; color: #2B7A78;">ID: <span style="color: #17252A; font-weight: 800;">${booking.id}</span></p>
          <p style="margin: 4px 0 0 0; font-size: 10px; font-weight: 500; color: #888;">Booked: ${bookingDate}</p>
        </div>
      </div>

      <!-- Main Content Grid -->
      <div style="display: flex; gap: 32px; position: relative; z-index: 10;">
        
        <!-- Left Column: Details -->
        <div style="flex: 1; display: flex; flex-direction: column; gap: 24px;">
          
          <!-- Passenger Info -->
          <div style="background: #f8fbfb; padding: 20px; border-radius: 16px; border: 1px solid #DEF2F1;">
            <h3 style="margin: 0 0 16px 0; font-size: 12px; font-weight: 800; color: #3AAFA9; text-transform: uppercase; letter-spacing: 1px;">Passenger Details</h3>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
              <div>
                <p style="margin: 0; font-size: 10px; font-weight: 600; color: #888; text-transform: uppercase;">Name</p>
                <p style="margin: 4px 0 0 0; font-size: 16px; font-weight: 800; color: #17252A;">${passengerData?.name || 'Valued Customer'}</p>
              </div>
              <div>
                <p style="margin: 0; font-size: 10px; font-weight: 600; color: #888; text-transform: uppercase;">Phone</p>
                <p style="margin: 4px 0 0 0; font-size: 14px; font-weight: 700; color: #17252A;">${passengerData?.phone || 'N/A'}</p>
              </div>
            </div>
          </div>

          <!-- Trip Info -->
          <div style="background: #f8fbfb; padding: 20px; border-radius: 16px; border: 1px solid #DEF2F1;">
            <h3 style="margin: 0 0 16px 0; font-size: 12px; font-weight: 800; color: #3AAFA9; text-transform: uppercase; letter-spacing: 1px;">Trip Details</h3>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
              <div>
                <p style="margin: 0; font-size: 10px; font-weight: 600; color: #888; text-transform: uppercase;">Route</p>
                <p style="margin: 4px 0 0 0; font-size: 14px; font-weight: 800; color: #17252A;">${route?.name || 'N/A'}</p>
              </div>
              <div>
                <p style="margin: 0; font-size: 10px; font-weight: 600; color: #888; text-transform: uppercase;">Departure Time</p>
                <p style="margin: 4px 0 0 0; font-size: 14px; font-weight: 800; color: #3AAFA9;">${formattedDate}</p>
              </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
              <div>
                <p style="margin: 0; font-size: 10px; font-weight: 600; color: #888; text-transform: uppercase;">Boarding Point</p>
                <p style="margin: 4px 0 0 0; font-size: 13px; font-weight: 700; color: #17252A;">${boarding?.name || 'N/A'}</p>
              </div>
              <div>
                <p style="margin: 0; font-size: 10px; font-weight: 600; color: #888; text-transform: uppercase;">Dropping Point</p>
                <p style="margin: 4px 0 0 0; font-size: 13px; font-weight: 700; color: #17252A;">${dropping?.name || 'N/A'}</p>
              </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; padding-top: 16px; border-top: 1px solid #DEF2F1;">
              <div>
                <p style="margin: 0; font-size: 10px; font-weight: 600; color: #888; text-transform: uppercase;">Coach No.</p>
                <p style="margin: 4px 0 0 0; font-size: 14px; font-weight: 800; color: #17252A;">${trip?.coachNumber || 'N/A'}</p>
              </div>
              <div>
                <p style="margin: 0; font-size: 10px; font-weight: 600; color: #888; text-transform: uppercase;">Class</p>
                <p style="margin: 4px 0 0 0; font-size: 14px; font-weight: 800; color: #17252A;">${bus ? (bus.isAC ? 'AC Premium' : 'Non-AC') : 'N/A'}</p>
              </div>
            </div>
          </div>

        </div>

        <!-- Right Column: Seats & QR -->
        <div style="width: 220px; display: flex; flex-direction: column; gap: 24px;">
          
          <!-- Seats & Fare -->
          <div style="background: #17252A; color: #FEFFFF; padding: 24px; border-radius: 16px; text-align: center; box-shadow: 0 10px 25px rgba(23, 37, 42, 0.2);">
            <p style="margin: 0; font-size: 10px; font-weight: 600; color: #3AAFA9; text-transform: uppercase; letter-spacing: 1px;">Seat(s)</p>
            <p style="margin: 8px 0 16px 0; font-size: 24px; font-weight: 900; color: #FEFFFF;">${booking.seats.join(', ')}</p>
            
            <div style="height: 1px; background: rgba(255,255,255,0.1); margin: 16px 0;"></div>
            
            <p style="margin: 0; font-size: 10px; font-weight: 600; color: #3AAFA9; text-transform: uppercase; letter-spacing: 1px;">Total Fare</p>
            <p style="margin: 8px 0 0 0; font-size: 20px; font-weight: 800; color: #FEFFFF;">৳ ${booking.totalFare.toLocaleString()}</p>
          </div>

          <!-- QR Code -->
          <div style="background: #FEFFFF; padding: 16px; border-radius: 16px; border: 2px solid #DEF2F1; text-align: center; display: flex; flex-direction: column; align-items: center;">
            ${qrCodeImg ? `<img src="${qrCodeImg}" style="width: 140px; height: 140px; margin-bottom: 12px;" />` : '<div style="width: 140px; height: 140px; background: #eee; margin-bottom: 12px;"></div>'}
            <p style="margin: 0; font-size: 10px; font-weight: 700; color: #17252A; text-transform: uppercase; letter-spacing: 1px;">Scan to Verify</p>
          </div>

        </div>
      </div>

      <!-- Footer -->
      <div style="margin-top: 32px; padding-top: 16px; border-top: 2px dashed #DEF2F1; text-align: center; position: relative; z-index: 10;">
        <p style="margin: 0; font-size: 10px; font-weight: 600; color: #2B7A78;">Please arrive at the boarding point at least 15 minutes before departure.</p>
        <p style="margin: 4px 0 0 0; font-size: 9px; font-weight: 500; color: #888;">This is a computer-generated document. No signature is required.</p>
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
  const htmlContent = getTicketHTML(booking, trip, route, boarding, dropping, bus, passengerData, qrCodeElementId);
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
  container.innerHTML = getTicketHTML(booking, trip, route, boarding, dropping, bus, passengerData, qrCodeElementId);

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
