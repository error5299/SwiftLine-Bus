import jsPDF from 'jspdf';
import { format } from 'date-fns';
import { Booking, Trip, Route, Counter, Bus, Passenger } from '../types';

export const generateTicketPDF = (
  booking: Booking,
  trip: Trip | undefined,
  route: Route | undefined,
  boarding: Counter | undefined,
  dropping: Counter | undefined,
  bus: Bus | undefined,
  passengerData: Partial<Passenger> | undefined,
  qrCodeElementId: string = 'ticket-qrcode'
) => {
  const doc = new jsPDF({
    unit: 'mm',
    format: 'a4'
  });

  // Colors
  const primaryColor = [0, 31, 63]; // #001F3F
  const accentColor = [242, 125, 38]; // #F27D26
  const textColor = [51, 51, 51];
  const lightGray = [240, 240, 240];

  // Header Background
  doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.rect(0, 0, 210, 40, 'F');

  // Header Text
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.text('SWIFTLINE', 20, 25);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Premium Bus Service', 20, 32);

  // E-Ticket Label
  doc.setFillColor(accentColor[0], accentColor[1], accentColor[2]);
  doc.rect(150, 15, 40, 10, 'F');
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('E-TICKET', 170, 22, { align: 'center' });

  // Reset Text Color
  doc.setTextColor(textColor[0], textColor[1], textColor[2]);

  // Ticket Info Box
  doc.setDrawColor(lightGray[0], lightGray[1], lightGray[2]);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(20, 50, 170, 30, 3, 3, 'FD');

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('TICKET ID', 25, 60);
  doc.text('DATE OF BOOKING', 80, 60);
  doc.text('STATUS', 140, 60);

  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text(booking.id, 25, 70);
  doc.text(format(new Date(booking.timestamp), 'dd MMM yyyy, hh:mm a'), 80, 70);
  doc.setTextColor(40, 167, 69); // Green
  doc.setFont('helvetica', 'bold');
  doc.text(booking.status === 'confirmed' ? 'CONFIRMED' : booking.status.toUpperCase(), 140, 70);
  doc.setTextColor(textColor[0], textColor[1], textColor[2]);

  // Passenger Details Box
  doc.setFillColor(lightGray[0], lightGray[1], lightGray[2]);
  doc.rect(20, 90, 170, 10, 'F');
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('PASSENGER DETAILS', 25, 97);

  doc.roundedRect(20, 100, 170, 30, 0, 0, 'D');
  doc.setFontSize(10);
  doc.text('Name:', 25, 110);
  doc.setFont('helvetica', 'normal');
  doc.text(passengerData?.name || 'Valued Customer', 50, 110);

  doc.setFont('helvetica', 'bold');
  doc.text('Phone:', 100, 110);
  doc.setFont('helvetica', 'normal');
  doc.text(passengerData?.phone || 'N/A', 120, 110);

  doc.setFont('helvetica', 'bold');
  doc.text('Gender:', 25, 120);
  doc.setFont('helvetica', 'normal');
  doc.text(passengerData?.gender === 'female' ? 'Female' : (passengerData?.gender === 'male' ? 'Male' : 'N/A'), 50, 120);

  // Trip Details Box
  doc.setFillColor(lightGray[0], lightGray[1], lightGray[2]);
  doc.rect(20, 140, 170, 10, 'F');
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('TRIP DETAILS', 25, 147);

  doc.roundedRect(20, 150, 170, 50, 0, 0, 'D');
  
  doc.setFontSize(10);
  doc.text('Route:', 25, 160);
  doc.setFont('helvetica', 'normal');
  doc.text(route?.name || 'N/A', 50, 160);

  doc.setFont('helvetica', 'bold');
  doc.text('Coach No:', 100, 160);
  doc.setFont('helvetica', 'normal');
  doc.text(trip?.coachNumber || 'N/A', 125, 160);

  doc.setFont('helvetica', 'bold');
  doc.text('Bus Type:', 150, 160);
  doc.setFont('helvetica', 'normal');
  doc.text(bus ? (bus.isAC ? 'AC' : 'Non-AC') : 'N/A', 170, 160);

  doc.setFont('helvetica', 'bold');
  doc.text('Boarding:', 25, 175);
  doc.setFont('helvetica', 'normal');
  doc.text(boarding?.name || 'N/A', 50, 175);

  doc.setFont('helvetica', 'bold');
  doc.text('Dropping:', 100, 175);
  doc.setFont('helvetica', 'normal');
  doc.text(dropping?.name || 'N/A', 125, 175);

  doc.setFont('helvetica', 'bold');
  doc.text('Dep. Time:', 25, 190);
  doc.setFont('helvetica', 'normal');
  doc.text(trip ? format(new Date(trip.departureTime), 'dd MMM yyyy, hh:mm a') : 'N/A', 50, 190);

  // Payment & Seats Box
  doc.setFillColor(lightGray[0], lightGray[1], lightGray[2]);
  doc.rect(20, 210, 100, 10, 'F');
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('PAYMENT & SEATS', 25, 217);

  doc.roundedRect(20, 220, 100, 30, 0, 0, 'D');
  
  doc.setFontSize(10);
  doc.text('Seat(s):', 25, 230);
  doc.setFont('helvetica', 'normal');
  doc.text(booking.seats.join(', '), 50, 230);

  doc.setFont('helvetica', 'bold');
  doc.text('Total Fare:', 25, 240);
  doc.setFont('helvetica', 'normal');
  doc.text(`BDT ${booking.totalFare}`, 50, 240);

  // QR Code
  const canvas = document.getElementById(qrCodeElementId) as HTMLCanvasElement;
  if (canvas) {
    const qrDataUrl = canvas.toDataURL('image/png');
    doc.addImage(qrDataUrl, 'PNG', 140, 210, 40, 40);
  }

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text('Please arrive at the boarding point 15 minutes before departure.', 105, 270, { align: 'center' });
  doc.text('This is a computer-generated document. No signature is required.', 105, 275, { align: 'center' });

  doc.save(`SwiftLine_Ticket_${booking.id}.pdf`);
};
