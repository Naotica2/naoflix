import React, { memo, useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator, Animated, TextInput, Keyboard, ScrollView } from 'react-native';
import { Modal, Portal } from 'react-native-paper';
import { useColorScheme, ToastAndroid, Alert } from 'react-native';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';
import { supabase } from '../../config/supabaseClient';
import { useAuth } from '../../misc/AuthContext';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import { LinearGradient } from 'expo-linear-gradient';

interface Props {
  visible: boolean;
  onDismiss: () => void;
}

function VIPOfferModal({ visible, onDismiss }: Props) {
  const isDark = useColorScheme() === 'dark';
  const { user, refreshProfile } = useAuth();
  
  const [loading, setLoading] = useState(false);
  const [qrImageUrl, setQrImageUrl] = useState<string | null>(null);
  const [transactionRef, setTransactionRef] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isInMaintenance, setIsInMaintenance] = useState(false);
  
  const [pendingRef, setPendingRef] = useState<string | null>(null);
  const [pendingAmount, setPendingAmount] = useState(0);

  const [voucherCode, setVoucherCode] = useState('');
  const [discountPercent, setDiscountPercent] = useState(0);
  const [voucherLoading, setVoucherLoading] = useState(false);
  const [voucherApplied, setVoucherApplied] = useState(false);
  
  const [selectedDays, setSelectedDays] = useState<30 | 90>(30);
  const basePrice = selectedDays === 90 ? 25000 : 9500;
  let finalPrice = Math.floor(basePrice - (basePrice * discountPercent / 100));
  if (finalPrice < 500) finalPrice = 500; 

  const scaleAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (visible) {
      try {
        const formatter = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jakarta', hour: 'numeric', minute: 'numeric', hour12: false });
        const timeStr = formatter.format(new Date());
        let [hourStr, minuteStr] = timeStr.split(':');
        let hour = parseInt(hourStr, 10);
        let minute = parseInt(minuteStr, 10);
        
        if (hour === 24) hour = 0;
        
        if ((hour === 23 && minute >= 50) || (hour === 0 && minute <= 20)) {
          setIsInMaintenance(true);
        } else {
          setIsInMaintenance(false);
        }
      } catch (e) {
        setIsInMaintenance(false);
      }
    } else {
      setPendingRef(null);
    }
  }, [visible]);

  useEffect(() => {
    if (visible && user && !qrImageUrl && !isSuccess) {
      supabase
        .from('transactions')
        .select('ref, amount, created_at')
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .then(({ data }) => {
          const txs = data as any[];
          if (txs && txs.length > 0) {
            const txDate = new Date(txs[0].created_at);
            const now = new Date();
            const diffMinutes = (now.getTime() - txDate.getTime()) / 1000 / 60;
            
            if (diffMinutes < 15) {
              setPendingRef(txs[0].ref);
              setPendingAmount(txs[0].amount);
            }
          }
        });
    }
  }, [visible, user, qrImageUrl, isSuccess]);

  useEffect(() => {
    if (!transactionRef || isSuccess) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`https://naoflix-backend.vercel.app/api/status?ref=${transactionRef}`);
        const data = await res.json();
        
        if (data && data.status === 'success') {
          setIsSuccess(true);
          refreshProfile(); // Refresh AuthContext so app knows user is VIP
          Animated.spring(scaleAnim, {
            toValue: 1,
            friction: 4,
            useNativeDriver: true,
          }).start(() => {
            Animated.loop(
              Animated.sequence([
                Animated.timing(pulseAnim, {
                  toValue: 1.1,
                  duration: 800,
                  useNativeDriver: true,
                }),
                Animated.timing(pulseAnim, {
                  toValue: 1,
                  duration: 800,
                  useNativeDriver: true,
                }),
              ])
            ).start();
          });
          clearInterval(interval);
        }
      } catch (err) {
        console.warn('Gagal cek status:', err);
      }
    }, 5000); // Cek setiap 5 detik

    return () => clearInterval(interval);
  }, [transactionRef, isSuccess, refreshProfile, scaleAnim]);



  const handleUpgrade = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const VERCEL_API_URL = 'https://naoflix-backend.vercel.app/api/deposit';

      const response = await fetch(VERCEL_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: finalPrice,
          userId: user.id,
          durationDays: selectedDays
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Gagal membuat transaksi ke PG');
      }
      
      if (data?.qr_image_url || data?.qris_string) {
        setQrImageUrl(data.qr_image_url);
        setTransactionRef(data.ref);
        setPaymentAmount(data.total || data.amount_unique || data.amount || finalPrice);
        
        
        console.log("HAMS_PG_RESPONSE:", JSON.stringify(data));
      } else {
        throw new Error('Gagal mendapatkan QRIS');
      }
    } catch (e: any) {
      ToastAndroid.show(e.message || 'Terjadi kesalahan sistem', ToastAndroid.LONG);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    const doClose = () => {
      setQrImageUrl(null);
      setTransactionRef(null);
      setPendingRef(null);
      setIsSuccess(false);
      scaleAnim.setValue(0);
      pulseAnim.setValue(1);
      pulseAnim.stopAnimation();
      setDiscountPercent(0);
      setVoucherApplied(false);
      onDismiss();
    };

    if (qrImageUrl && !isSuccess) {
      Alert.alert(
        'Tunggu!',
        'Anda belum menyelesaikan pembayaran. Yakin ingin menutup QRIS ini? Tagihan ini akan hangus jika Anda membuat transaksi baru.',
        [
          { text: 'Tidak' },
          { text: 'Ya, Tutup', onPress: doClose }
        ]
      );
    } else {
      doClose();
    }
  };

  const handleResumePending = async () => {
    setLoading(true);
    try {
      const res = await fetch(`https://naoflix-backend.vercel.app/api/status?ref=${pendingRef}`);
      const data = await res.json();
      if (data && data.qr_image_url) {
        setQrImageUrl(data.qr_image_url);
        setTransactionRef(pendingRef);
        setPaymentAmount(data.total || data.amount_unique || data.amount || pendingAmount);
      } else {
        ToastAndroid.show('Gagal memuat QRIS. Tagihan mungkin kadaluarsa.', ToastAndroid.SHORT);
        setPendingRef(null);
      }
    } catch (e) {
      ToastAndroid.show('Terjadi kesalahan jaringan', ToastAndroid.SHORT);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelPending = () => {
    setPendingRef(null);
  };

  const applyVoucher = async () => {
    if (!voucherCode.trim()) return;
    Keyboard.dismiss();
    setVoucherLoading(true);
    try {
      const { data, error } = await supabase
        .from('vouchers')
        .select('discount_percent, valid_until, is_active')
        .eq('code', voucherCode.toUpperCase())
        .single();
        
      const vData = data as any;
      if (error || !vData) throw new Error('Voucher tidak ditemukan');
      if (!vData.is_active) throw new Error('Voucher sudah tidak aktif');
      if (vData.valid_until && new Date(vData.valid_until) < new Date()) throw new Error('Voucher sudah expired');
      
      setDiscountPercent(vData.discount_percent);
      setVoucherApplied(true);
      ToastAndroid.show(`Diskon ${vData.discount_percent}% berhasil digunakan!`, ToastAndroid.SHORT);
    } catch (e: any) {
      ToastAndroid.show(e.message, ToastAndroid.SHORT);
      setDiscountPercent(0);
      setVoucherApplied(false);
    } finally {
      setVoucherLoading(false);
    }
  };

  return (
    <Portal>
      <Modal visible={visible} onDismiss={handleClose} contentContainerStyle={[styles.modal, { backgroundColor: isDark ? '#1C1C1E' : '#ffffff' }]}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 10, flexGrow: 1 }}>
        {isSuccess ? (
          <View style={styles.successContainer}>
            <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
              <Animated.View style={[styles.successGlow, { transform: [{ scale: pulseAnim }] }]}>
                <LinearGradient
                  colors={['#10B981', '#059669', '#F59E0B']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={[styles.successIconBg, { width: 90, height: 90, borderRadius: 45, borderWidth: 3, borderColor: '#FFD700' }]}
                >
                  <MaterialCommunityIcons name="check-decagram" size={50} color="#fff" />
                </LinearGradient>
              </Animated.View>
            </Animated.View>
            <Text style={[styles.title, { color: '#F59E0B', marginTop: 20, fontSize: 26, textShadowColor: 'rgba(245,158,11,0.3)', textShadowOffset: {width: 0, height: 2}, textShadowRadius: 4, letterSpacing: 1 }]}>
              STATUS VIP AKTIF
            </Text>
            <Text style={[styles.subtitle, { textAlign: 'center', marginBottom: 24, paddingHorizontal: 15, fontSize: 15, fontWeight: 'bold' }]}>
              Pembayaran berhasil diverifikasi.{'\n'}Akun Anda kini telah ditingkatkan ke versi VIP.
            </Text>
            <TouchableOpacity style={[styles.premiumBtn, { elevation: 8, shadowColor: '#F59E0B' }]} onPress={handleClose}>
              <LinearGradient colors={['#F59E0B', '#D97706']} style={styles.gradientBtn}>
                <Text style={styles.upgradeBtnText}>Mulai Menonton</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        ) : qrImageUrl ? (
          <View style={styles.qrContainer}>
            <Text style={[styles.title, { color: isDark ? '#fff' : '#000', marginBottom: 10 }]}>Selesaikan Pembayaran</Text>
            
            <View style={styles.paymentInfoBox}>
              <Text style={styles.paymentInfoLabel}>Total Pembayaran</Text>
              <Text style={[styles.paymentInfoAmount, { color: '#10B981' }]}>
                Rp {paymentAmount.toLocaleString('id-ID')}
              </Text>
              <Text style={styles.paymentInfoWarning}>
                * Nominal sudah termasuk kode unik otomatis. Mohon jangan ubah nominal saat bayar agar status langsung diproses!
              </Text>
            </View>

            <Text style={[styles.subtitle, { textAlign: 'center', marginBottom: 15 }]}>
              Ref: {transactionRef}
            </Text>
            <View style={styles.qrWrapper}>
              <Image source={{ uri: qrImageUrl }} style={styles.qrImage} resizeMode="contain" />
            </View>
            <Text style={[styles.subtitle, { textAlign: 'center', marginTop: 10, paddingHorizontal: 10 }]}>
              Silakan scan QRIS di atas menggunakan DANA, Gopay, atau E-Wallet lainnya.
            </Text>
            
            <Text style={{ textAlign: 'center', color: '#F59E0B', fontSize: 13, fontWeight: 'bold', marginTop: 8, paddingHorizontal: 15 }}>
              ⚠️ Mohon tunggu di halaman ini maks 10-15 detik setelah bayar sampai animasi berhasil muncul!
            </Text>
            
            <View style={{ width: '100%', marginTop: 16 }}>
              <View style={[styles.perksContainer, { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.08)', borderColor: '#3B82F6', borderWidth: 1 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 }}>
                  <MaterialCommunityIcons name="lightbulb-on-outline" size={20} color="#3B82F6" style={{ marginRight: 8, marginTop: 2 }} />
                  <Text style={[styles.perkText, { color: isDark ? '#fff' : '#111', flex: 1, fontWeight: 'bold' }]}>
                    Cara Bayar Tanpa Ribet:
                  </Text>
                </View>
                <Text style={{ fontSize: 14, color: isDark ? '#ccc' : '#444', marginLeft: 28, lineHeight: 22, fontWeight: '500' }}>
                  1. <Text style={{ fontWeight: 'bold', color: isDark ? '#fff' : '#000' }}>Screenshot</Text> (Tangkapan Layar) halaman ini.{'\n'}
                  2. Buka aplikasi DANA / GoPay / OVO.{'\n'}
                  3. Pilih menu <Text style={{ fontWeight: 'bold', color: isDark ? '#fff' : '#000' }}>Scan QRIS</Text>.{'\n'}
                  4. Klik ikon <Text style={{ fontWeight: 'bold', color: isDark ? '#fff' : '#000' }}>Gambar/Galeri</Text> dan pilih gambar Screenshot tadi.
                </Text>
              </View>
            </View>

            <TouchableOpacity style={styles.cancelBtn} onPress={handleClose}>
              <Text style={styles.cancelBtnText}>Batal</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {pendingRef && (
              <View style={[styles.pendingCard, { backgroundColor: isDark ? '#2D3748' : '#EBF4FF' }]}>
                <MaterialCommunityIcons name="information" size={24} color="#3182CE" style={{ marginBottom: 4 }} />
                <Text style={{ color: isDark ? '#fff' : '#000', fontWeight: 'bold', fontSize: 16 }}>Tagihan Tertunda</Text>
                <Text style={{ color: isDark ? '#ccc' : '#444', fontSize: 13, marginBottom: 12, textAlign: 'center' }}>
                  Anda memiliki 1 tagihan sebesar Rp {pendingAmount.toLocaleString('id-ID')} yang belum dibayar.
                </Text>
                <View style={{ flexDirection: 'row', width: '100%', gap: 8 }}>
                  <TouchableOpacity
                    style={{ flex: 1, backgroundColor: '#3182CE', padding: 10, borderRadius: 8, alignItems: 'center' }}
                    onPress={handleResumePending}
                  >
                    <Text style={{ color: '#fff', fontWeight: 'bold' }}>Lanjutkan</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ flex: 1, backgroundColor: 'transparent', borderWidth: 1, borderColor: '#FC8181', padding: 10, borderRadius: 8, alignItems: 'center' }}
                    onPress={handleCancelPending}
                  >
                    <Text style={{ color: '#FC8181', fontWeight: 'bold' }}>Buat Baru</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {!pendingRef && (
              <>
                <View style={[styles.header, { marginTop: 16 }]}>
                  <LinearGradient colors={['#FDE68A', '#F59E0B']} style={styles.crownContainer}>
                <MaterialCommunityIcons name="crown" size={36} color="#fff" />
              </LinearGradient>
              <Text style={[styles.title, { color: isDark ? '#fff' : '#000' }]}>NaoFlix VIP</Text>
              <Text style={styles.subtitle}>Bebaskan pengalaman menontonmu</Text>
            </View>

            <View style={styles.packageSelector}>
              <TouchableOpacity
                style={[
                  styles.packageOption,
                  selectedDays === 30 && [styles.packageOptionActive, { borderColor: '#F59E0B' }],
                  { backgroundColor: isDark ? '#2C2C2E' : '#f5f5f5' }
                ]}
                onPress={() => setSelectedDays(30)}
              >
                <Text style={[styles.packageDuration, { color: isDark ? '#fff' : '#000' }]}>1 Bulan</Text>
                <Text style={[styles.packagePrice, { color: '#F59E0B' }]}>Rp 9.500</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.packageOption,
                  selectedDays === 90 && [styles.packageOptionActive, { borderColor: '#F59E0B' }],
                  { backgroundColor: isDark ? '#2C2C2E' : '#f5f5f5' }
                ]}
                onPress={() => setSelectedDays(90)}
              >
                <View style={styles.badgeDiscount}><Text style={styles.badgeDiscountText}>HEMAT!</Text></View>
                <Text style={[styles.packageDuration, { color: isDark ? '#fff' : '#000' }]}>3 Bulan</Text>
                <Text style={[styles.packagePrice, { color: '#F59E0B' }]}>Rp 25.000</Text>
                <Text style={[styles.packagePriceStrike, { color: isDark ? '#888' : '#aaa' }]}>Rp 28.500</Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.perksContainer, { backgroundColor: isDark ? '#2C2C2E' : '#FFFBEB', borderColor: isDark ? '#3A3A3C' : '#FDE68A' }]}>
              {discountPercent > 0 ? (
                <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 4}}>
                  <Text style={[styles.priceText, { color: isDark ? '#888' : '#aaa', textDecorationLine: 'line-through', fontSize: 16, marginRight: 8 }]}>Rp {basePrice.toLocaleString('id-ID')}</Text>
                  <Text style={[styles.priceText, { color: isDark ? '#fff' : '#000' }]}>Rp {finalPrice.toLocaleString('id-ID')}</Text>      
                </View>
              ) : (
                <Text style={[styles.priceText, { color: isDark ? '#fff' : '#000' }]}>Rp {basePrice.toLocaleString('id-ID')}</Text>      
              )}
              <Text style={[styles.taxInfo, { color: isDark ? '#8E8E93' : '#999' }]}>* Belum termasuk biaya admin / kode unik</Text>
              <View style={styles.perkRow}>
                <MaterialCommunityIcons name="check-circle" size={22} color="#F59E0B" />
                <Text style={[styles.perkText, { color: isDark ? '#E5E5EA' : '#333' }]}>Buat Room Nobar Tanpa Batas</Text>
              </View>
              <View style={styles.perkRow}>
                <MaterialCommunityIcons name="check-circle" size={22} color="#F59E0B" />
                <Text style={[styles.perkText, { color: isDark ? '#E5E5EA' : '#333' }]}>Badge Mahkota Emas & Frame Eksklusif</Text>
              </View>
              <View style={styles.perkRow}>
                <MaterialCommunityIcons name="check-circle" size={22} color="#F59E0B" />
                <Text style={[styles.perkText, { color: isDark ? '#E5E5EA' : '#333' }]}>Nama Emas Spesial di Kolom Chat</Text>
              </View>
              <View style={styles.perkRow}>
                <MaterialCommunityIcons name="check-circle" size={22} color="#F59E0B" />
                <Text style={[styles.perkText, { color: isDark ? '#E5E5EA' : '#333' }]}>Mendukung operasional NaoFlix</Text>
              </View>
            </View>

            {isInMaintenance && (
              <View style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', borderColor: '#EF4444', borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                  <MaterialCommunityIcons name="alert-circle-outline" size={18} color="#EF4444" style={{ marginRight: 6 }} />
                  <Text style={{ color: '#EF4444', fontWeight: 'bold', fontSize: 13 }}>Sistem Sedang Maintenance</Text>
                </View>
                <Text style={{ color: isDark ? '#FCA5A5' : '#B91C1C', fontSize: 12, lineHeight: 18 }}>
                  Gateway pembayaran sedang dalam pemeliharaan rutin (23:55 - 00:15 WIB). Harap kembali lagi setelah pukul 00:20 WIB.
                </Text>
              </View>
            )}

            <View style={styles.voucherContainer}>
              <TextInput 
                style={[styles.voucherInput, { color: isDark ? '#fff' : '#000', backgroundColor: isDark ? '#2C2C2E' : '#f0f0f0', borderColor: voucherApplied ? '#10B981' : (isDark ? '#444' : '#ccc') }]}
                placeholder="Punya kode voucher?"
                placeholderTextColor={isDark ? '#888' : '#999'}
                value={voucherCode}
                onChangeText={(text) => {
                  setVoucherCode(text.toUpperCase());
                  if (voucherApplied) {
                    setVoucherApplied(false);
                    setDiscountPercent(0);
                  }
                }}
                editable={!voucherLoading}
                autoCapitalize="characters"
              />
              <TouchableOpacity 
                style={[styles.voucherBtn, voucherCode.trim() === '' ? { opacity: 0.5 } : {}, voucherApplied ? { backgroundColor: '#10B981' } : {}]} 
                onPress={applyVoucher}
                disabled={voucherLoading || voucherCode.trim() === '' || voucherApplied}
              >
                {voucherLoading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.voucherBtnText}>{voucherApplied ? 'Dipakai' : 'Gunakan'}</Text>
                )}
              </TouchableOpacity>
            </View>

            <TouchableOpacity 
              style={[styles.premiumBtn, (loading || isInMaintenance) && { opacity: 0.5 }]}
              activeOpacity={0.8}
              onPress={handleUpgrade}
              disabled={loading || isInMaintenance}
            >
              <LinearGradient colors={['#F59E0B', '#D97706']} style={styles.gradientBtn}>
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.upgradeBtnText}>Upgrade ke VIP Sekarang</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>
            </>
            )}
            
            <TouchableOpacity style={styles.cancelBtn} onPress={handleClose}>
              <Text style={styles.cancelBtnText}>Mungkin Nanti</Text>
            </TouchableOpacity>
          </>
        )}
        </ScrollView>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  modal: {
    margin: 20,
    borderRadius: 24,
    padding: 24,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 15,
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  crownContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    elevation: 6,
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  successGlow: {
    padding: 10,
    borderRadius: 60,
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
  },
  title: {
    fontSize: 26,
    fontWeight: '900',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 15,
    color: '#8E8E93',
  },
  perksContainer: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
  },
  priceText: {
    fontSize: 30,
    fontWeight: '900',
    marginBottom: 4,
    textAlign: 'center',
  },
  taxInfo: {
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 20,
    fontStyle: 'italic',
  },
  priceSub: {
    fontSize: 15,
    fontWeight: '600',
    color: '#8E8E93',
  },
  perkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  perkText: {
    fontSize: 15,
    flex: 1,
    fontWeight: '600',
  },
  premiumBtn: {
    width: '100%',
    borderRadius: 16,
    marginBottom: 12,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  gradientBtn: {
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  upgradeBtnText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  cancelBtnText: {
    color: '#8E8E93',
    fontSize: 16,
    fontWeight: '700',
  },
  qrContainer: {
    alignItems: 'center',
  },
  paymentInfoBox: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    padding: 16,
    borderRadius: 16,
    width: '100%',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  paymentInfoLabel: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 4,
  },
  paymentInfoAmount: {
    fontSize: 26,
    fontWeight: '900',
    marginBottom: 8,
  },
  paymentInfoWarning: {
    fontSize: 12,
    color: '#F59E0B',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  qrWrapper: {
    width: 240,
    height: 240,
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 20,
    marginBottom: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  qrImage: {
    width: 216,
    height: 216,
  },
  successContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  successIconBg: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  voucherContainer: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 8,
  },
  voucherInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 44,
    fontSize: 14,
  },
  voucherBtn: {
    backgroundColor: '#3B82F6',
    borderRadius: 8,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  voucherBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  packageSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 16,
    gap: 12,
  },
  packageOption: {
    flex: 1,
    borderWidth: 2,
    borderColor: 'transparent',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    position: 'relative',
  },
  packageOptionActive: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
  },
  packageDuration: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  packagePrice: {
    fontSize: 16,
    fontWeight: '900',
  },
  packagePriceStrike: {
    fontSize: 12,
    textDecorationLine: 'line-through',
    marginTop: 2,
  },
  badgeDiscount: {
    position: 'absolute',
    top: -10,
    right: -10,
    backgroundColor: '#EF4444',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    zIndex: 1,
  },
  badgeDiscountText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  pendingCard: {
    width: '100%',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#4299E1',
  }
});

export default memo(VIPOfferModal);
