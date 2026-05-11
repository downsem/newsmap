import './globals.css';

export const metadata = {
  title: 'NewsMap MVP',
  description: 'A map-first geographic news explorer MVP.'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
