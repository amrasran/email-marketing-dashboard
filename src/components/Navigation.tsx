'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/', label: 'Summary' },
  { href: '/campaigns', label: 'Campaigns' },
  { href: '/flows', label: 'Flows' },
  { href: '/weekly-reporting', label: 'Weekly Reporting' },
  { href: '/benchmarks', label: 'Benchmarks' },
  { href: '/explorer', label: 'Explorer' },
  { href: '/upload', label: 'Upload' },
];

export default function Navigation() {
  const pathname = usePathname();

  return (
    <header className="bg-white border-b border-muted">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-14">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <span className="text-lg font-bold text-forest font-heading tracking-tight">BROC SHOT</span>
            <span className="text-xs text-charcoal-light font-medium">Email Dashboard</span>
          </Link>

          {/* Nav tabs */}
          <nav className="flex gap-1">
            {navItems.map(item => {
              const isActive = item.href === '/'
                ? pathname === '/'
                : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-2 text-sm font-medium rounded-sm transition-colors ${
                    isActive
                      ? 'bg-sage text-charcoal'
                      : 'text-charcoal-light hover:text-charcoal hover:bg-mint'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </header>
  );
}
