import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';

interface Props {
  expiresAt: string | null | undefined;
  fr: boolean;
}

export default function PartnerExpirationAlert({ expiresAt, fr }: Props) {
  if (!expiresAt) return null;
  const daysLeft = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  const isExpired = daysLeft <= 0;
  const isUrgent = daysLeft > 0 && daysLeft <= 7;
  const isWarning = daysLeft > 7 && daysLeft <= 30;
  if (!isExpired && !isUrgent && !isWarning) return null;

  const color = isExpired ? '#EF4444' : isUrgent ? '#F97316' : '#F59E0B';
  const bg = isExpired ? '#FEF2F2' : isUrgent ? '#FFF7ED' : '#FFFBEB';
  const border = isExpired ? '#FECACA' : isUrgent ? '#FDBA74' : '#FDE68A';
  const icon = isExpired ? 'error' : isUrgent ? 'warning' : 'schedule';
  const title = isExpired
    ? (fr ? 'Partenariat expire' : 'Partnership expired')
    : isUrgent
    ? (fr ? `Expire dans ${daysLeft} jour(s)` : `Expires in ${daysLeft} day(s)`)
    : (fr ? `Expire dans ${daysLeft} jours` : `Expires in ${daysLeft} days`);
  const desc = isExpired
    ? (fr ? 'Votre banniere et vos avantages ne sont plus actifs.' : 'Your banner and benefits are no longer active.')
    : isUrgent
    ? (fr ? 'Renouvelez maintenant pour eviter une interruption.' : 'Renew now to avoid interruption.')
    : (fr ? 'Pensez a renouveler votre partenariat.' : 'Consider renewing your partnership.');

  return (
    <View style={{ backgroundColor: bg, borderRadius: 18, padding: 16, marginBottom: 14, borderWidth: 1.5, borderColor: border }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: color + '18', alignItems: 'center', justifyContent: 'center' }}>
          <MaterialIcons name={icon as any} size={24} color={color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color }}>{title}</Text>
          <Text style={{ fontSize: 12, color: color + 'CC', marginTop: 2, lineHeight: 17 }}>{desc}</Text>
        </View>
      </View>
      {!isExpired ? (
        <View style={{ marginTop: 12 }}>
          <View style={{ height: 6, backgroundColor: color + '15', borderRadius: 3, overflow: 'hidden' }}>
            <View style={{ height: '100%' as any, width: `${Math.max(3, Math.min(100, (daysLeft / 365) * 100))}%`, backgroundColor: color, borderRadius: 3 }} />
          </View>
          <Text style={{ fontSize: 10, color, marginTop: 4, textAlign: 'right' }}>
            {new Date(expiresAt).toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' })}
          </Text>
        </View>
      ) : null}
      <Pressable
        style={({ pressed }) => [{ flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 8, backgroundColor: color, paddingVertical: 12, borderRadius: 12, marginTop: 12 }, pressed && { opacity: 0.85 }]}
        onPress={() => router.push('/partnerships' as any)}
      >
        <MaterialIcons name="autorenew" size={18} color="#FFF" />
        <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFF' }}>{fr ? 'Renouveler maintenant' : 'Renew now'}</Text>
      </Pressable>
    </View>
  );
}
