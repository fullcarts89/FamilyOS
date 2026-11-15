import {
  Baby,
  BookOpen,
  HeartPulse,
  Home,
  PawPrint,
  UserRound,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react-native';
import type { Contact, ContactCategory } from '../../lib/api';

/** Categories in the API's order (health first). */
export const CATEGORIES: ContactCategory[] = [
  'health',
  'childcare',
  'school',
  'pets',
  'home',
  'services',
  'family',
  'other',
];

export const CATEGORY: Record<ContactCategory, { label: string; icon: LucideIcon }> = {
  health: { label: 'Health', icon: HeartPulse },
  childcare: { label: 'Childcare', icon: Baby },
  school: { label: 'School', icon: BookOpen },
  pets: { label: 'Pets', icon: PawPrint },
  home: { label: 'Home', icon: Home },
  services: { label: 'Services', icon: Wrench },
  family: { label: 'Family & friends', icon: Users },
  other: { label: 'Other', icon: UserRound },
};

/** Digits and a leading + for tel: and sms: links ("(503) 555-0114" → "5035550114"). */
export const dialable = (phone: string) => phone.replace(/[^0-9+*#]/g, '');

/** "Pediatrician · Hawthorne Pediatrics". */
export const roleLine = (c: Pick<Contact, 'role' | 'organization'>) =>
  [c.role, c.organization].filter(Boolean).join(' · ');
