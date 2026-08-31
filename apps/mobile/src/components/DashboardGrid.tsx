import type { ReactElement } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ComplaintCategory } from '@driver-complaint/shared-types';

export interface GridTile {
  id: ComplaintCategory;
  title: string;
  subtitle?: string;
  icon: keyof typeof Ionicons.glyphMap;
  bgColor: string;
  borderColor: string;
  textColor: string;
  iconBgColor: string;
  badge?: string;
}

export const DASHBOARD_TILES: GridTile[] = [
  {
    id: 'LOADING',
    title: 'Loading / Unloading',
    subtitle: 'GPS Proof & Waiting Timer',
    icon: 'truck',
    bgColor: '#FFE4E6', // Pastel Pink
    borderColor: '#FDA4AF',
    textColor: '#9F1239',
    iconBgColor: '#FFFFFF',
  },
  {
    id: 'BREAKDOWN',
    title: 'Breakdown',
    subtitle: 'Vehicle Repairs',
    icon: 'build',
    bgColor: '#FEF9C3', // Yellow (matching diagram)
    borderColor: '#FDE047',
    textColor: '#854D0E',
    iconBgColor: '#FFFFFF',
  },
  {
    id: 'TYRE_ISSUE',
    title: 'Tyre issue',
    subtitle: 'Puncture / Burst',
    icon: 'disc',
    bgColor: '#FEF9C3', // Yellow (matching diagram)
    borderColor: '#FDE047',
    textColor: '#854D0E',
    iconBgColor: '#FFFFFF',
  },
  {
    id: 'FUEL_DEF',
    title: 'Fuel / DEF',
    subtitle: 'Refill & Cards',
    icon: 'water',
    bgColor: '#FFFFFF', // White (matching diagram)
    borderColor: '#CBD5E1',
    textColor: '#0F172A',
    iconBgColor: '#F1F5F9',
  },
  {
    id: 'ACCOUNTS',
    title: 'Accounts',
    subtitle: 'Cash & Allowance',
    icon: 'wallet',
    bgColor: '#FFE4E6', // Pink (matching diagram)
    borderColor: '#FDA4AF',
    textColor: '#9F1239',
    iconBgColor: '#FFFFFF',
  },
  {
    id: 'COMPLAINT_STATUS',
    title: 'Complaint / Status',
    subtitle: 'Track My Tickets',
    icon: 'document-text',
    bgColor: '#DCFCE7', // Green (matching diagram)
    borderColor: '#86EFAC',
    textColor: '#166534',
    iconBgColor: '#FFFFFF',
  },
  {
    id: 'MEDICAL_EMERGENCY',
    title: 'Medical Emergency',
    subtitle: 'Instant Dispatch Alert',
    icon: 'medical',
    bgColor: '#FEE2E2', // Emergency Pink/Red (matching diagram)
    borderColor: '#FCA5A5',
    textColor: '#991B1B',
    iconBgColor: '#FFFFFF',
    badge: 'SOS',
  },
  {
    id: 'SUPPORT',
    title: 'Support',
    subtitle: 'Help Helpline',
    icon: 'headset',
    bgColor: '#DCFCE7', // Green (matching diagram)
    borderColor: '#86EFAC',
    textColor: '#166534',
    iconBgColor: '#FFFFFF',
  },
];

interface DashboardGridProps {
  onTilePress: (tile: GridTile) => void;
}

export function DashboardGrid({ onTilePress }: DashboardGridProps): ReactElement {
  return (
    <View style={styles.gridContainer}>
      <Text style={styles.sectionHeader}>Select Quick Service Action ⚡</Text>
      <View style={styles.tilesGrid}>
        {DASHBOARD_TILES.map((tile) => (
          <Pressable
            key={tile.id}
            style={({ pressed }) => [
              styles.tileCard,
              {
                backgroundColor: tile.bgColor,
                borderColor: tile.borderColor,
                transform: [{ scale: pressed ? 0.96 : 1 }],
              },
            ]}
            onPress={() => onTilePress(tile)}
          >
            {tile.badge ? (
              <View style={styles.badgePill}>
                <Text style={styles.badgeText}>{tile.badge}</Text>
              </View>
            ) : null}

            {/* Circular Logo/Icon */}
            <View style={[styles.iconCircle, { backgroundColor: tile.iconBgColor }]}>
              <Ionicons name={tile.icon} size={28} color={tile.textColor} />
            </View>

            {/* Title Button Label */}
            <View style={styles.titleContainer}>
              <Text style={[styles.tileTitle, { color: tile.textColor }]} numberOfLines={1}>
                {tile.title}
              </Text>
              {tile.subtitle ? (
                <Text style={[styles.tileSubtitle, { color: tile.textColor }]} numberOfLines={1}>
                  {tile.subtitle}
                </Text>
              ) : null}
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  gridContainer: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 12,
  },
  sectionHeader: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 4,
  },
  tilesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  tileCard: {
    width: '48%', // 2 columns grid as drawn in wireframe
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 125,
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  badgePill: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#DC2626',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  titleContainer: {
    alignItems: 'center',
    width: '100%',
  },
  tileTitle: {
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
  },
  tileSubtitle: {
    fontSize: 11,
    fontWeight: '500',
    opacity: 0.8,
    marginTop: 2,
    textAlign: 'center',
  },
});
