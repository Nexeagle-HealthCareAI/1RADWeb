import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Alert,
  Modal,
  TextInput,
  FlatList,
  RefreshControl,
  Platform
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useAuth } from '../context/AuthContext';
import { useAppointments } from '../context/AppointmentContext';
import apiClient from '../api/apiClient';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../theme/TacticalTheme';
import AnimatedStatCard from '../components/AnimatedStatCard';
import GradientButton from '../components/GradientButton';
import EmptyState from '../components/EmptyState';
import BottomNavBar from '../components/BottomNavBar';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Shield,
  Users,
  Calendar,
  Activity,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Clock,
  BarChart3,
  Settings,
  Database,
  UserCheck,
  FileText,
  Zap,
  Plus,
  Edit3,
  Trash2,
  X,
  Eye,
  EyeOff,
  Building2
} from 'lucide-react-native';

const { width } = Dimensions.get('window');

// Role metadata for styling
const ROLE_META = {
  doctor: { color: COLORS.cyan, bg: COLORS.cyan + '20', icon: '🩺', label: 'Diagnostic Consultant' },
  admindoctor: { color: COLORS.indigo, bg: COLORS.indigo + '20', icon: '🔱', label: 'Chief Medical Officer' },
  technician: { color: COLORS.gold, bg: COLORS.gold + '20', icon: '🛠️', label: 'Imaging Specialist' },
  receptionist: { color: '#e84393', bg: '#e84393' + '20', icon: '📅', label: 'Intake Coordinator' },
  admin: { color: COLORS.indigo, bg: COLORS.indigo + '20', icon: '🔑', label: 'Operations Director' }
};

export default function AdminBoardScreen({ navigation }) {
  const { user, isAdmin, activeCenter } = useAuth();
  const { appointments, patients, doctors } = useAppointments();
  
  // Tab state
  const [activeTab, setActiveTab] = useState('INTELLIGENCE');
  
  // Personnel state
  const [personnel, setPersonnel] = useState([]);
  const [personnelLoading, setPersonnelLoading] = useState(false);
  const [isPersonnelModalOpen, setIsPersonnelModalOpen] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  
  // Referral Intel state
  const [referralRange, setReferralRange] = useState({ 
    start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    end: new Date()
  });
  const [referralFilterMode, setReferralFilterMode] = useState('RANGE'); // 'SINGLE' or 'RANGE'
  const [expandedReferrer, setExpandedReferrer] = useState(null);
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  
  // Hospital settings state
  const [hospitalData, setHospitalData] = useState({
    hospitalName: '',
    hospitalAddress: '',
    gstin: '',
    registrationNumber: '',
    pan: '',
    nabhNumber: ''
  });
  const [hospitalLoading, setHospitalLoading] = useState(false);
  const [savingHospital, setSavingHospital] = useState(false);

  // Calculate statistics
  const todayAppointments = appointments.filter(apt => {
    const today = new Date().toISOString().split('T')[0];
    return apt.date === today;
  });

  const confirmedToday = todayAppointments.filter(apt => apt.status === 'confirmed').length;
  const pendingToday = todayAppointments.filter(apt => apt.status === 'pending').length;
  const urgentAppointments = appointments.filter(apt => apt.priority === 'urgent').length;

  // --- API Sync ---
  const fetchPersonnel = useCallback(async () => {
    setPersonnelLoading(true);
    try {
      const response = await apiClient.get('/personnel');
      setPersonnel(response.data);
    } catch (error) {
      console.error('[MOBILE ADMIN] Staff fetch failed:', error);
      Alert.alert('Error', 'Failed to fetch personnel');
    } finally {
      setPersonnelLoading(false);
    }
  }, [activeCenter]);

  const fetchHospitalData = useCallback(async () => {
    if (!activeCenter?.id) return;
    setHospitalLoading(true);
    try {
      const response = await apiClient.get(`/hospitals/${activeCenter.id}`);
      setHospitalData(response.data);
    } catch (error) {
      console.error('[MOBILE ADMIN] Hospital fetch failed:', error);
    } finally {
      setHospitalLoading(false);
    }
  }, [activeCenter]);

  // Mock patients data for referral intel
  const mockPatients = [
    {
      id: 'P001',
      name: 'John Smith',
      age: 45,
      gender: 'Male',
      referredBy: 'Dr. Michael Chen',
      sourceContact: '+91-9876543210',
      registered: '2026-04-15'
    },
    {
      id: 'P002',
      name: 'Sarah Williams',
      age: 32,
      gender: 'Female',
      referredBy: 'City General Hospital',
      sourceContact: 'contact@citygeneral.com',
      registered: '2026-04-16'
    },
    {
      id: 'P003',
      name: 'Robert Davis',
      age: 58,
      gender: 'Male',
      referredBy: 'Dr. Michael Chen',
      sourceContact: '+91-9876543210',
      registered: '2026-04-17'
    },
    {
      id: 'P004',
      name: 'Emily Johnson',
      age: 28,
      gender: 'Female',
      referredBy: 'Direct / Walk-in',
      sourceContact: 'N/A',
      registered: '2026-04-18'
    },
    {
      id: 'P005',
      name: 'Michael Brown',
      age: 41,
      gender: 'Male',
      referredBy: 'Metro Clinic',
      sourceContact: 'info@metroclinic.com',
      registered: '2026-04-18'
    },
    {
      id: 'P006',
      name: 'Lisa Anderson',
      age: 35,
      gender: 'Female',
      referredBy: 'City General Hospital',
      sourceContact: 'contact@citygeneral.com',
      registered: '2026-04-18'
    }
  ];

  // Mock patients data removed - using real patients from AppointmentContext if needed

  useEffect(() => {
    if (activeTab === 'PERSONNEL') {
      fetchPersonnel();
    } else if (activeTab === 'HOSPITAL') {
      fetchHospitalData();
    }
  }, [activeTab, fetchPersonnel, fetchHospitalData, activeCenter]);

  const handleOpenPersonnelModal = (user = null) => {
    setEditUser(user ? { ...user } : {
      name: '',
      email: '',
      mobile: '',
      password: '',
      roles: ['doctor'],
      specialization: '',
      degree: '',
      licenseNo: '',
      status: 'active'
    });
    setIsPersonnelModalOpen(true);
  };

  const handleSavePersonnel = async () => {
    if (!editUser.name || !editUser.email || !editUser.mobile) {
      Alert.alert('Error', 'Please fill all required fiels');
      return;
    }

    try {
      if (editUser.userId) {
        // Update
        await apiClient.put(`/personnel/${editUser.userId}`, {
          fullName: editUser.name,
          email: editUser.email,
          mobile: editUser.mobile,
          roleNames: editUser.roles
        });
        Alert.alert('Success', 'Personnel updated successfully');
      } else {
        // Create
        await apiClient.post('/personnel', {
          fullName: editUser.name,
          email: editUser.email,
          mobile: editUser.mobile,
          roleNames: editUser.roles,
          password: editUser.password || 'Secure@123'
        });
        Alert.alert('Success', 'Personnel added successfully');
      }
      fetchPersonnel();
      setIsPersonnelModalOpen(false);
      setEditUser(null);
    } catch (error) {
      console.error('[MOBILE ADMIN] Save staff failed:', error);
      Alert.alert('Error', 'Failed to save personnel');
    }
  };

  const handleDeletePersonnel = (id, roles) => {
    const isSuper = roles.includes('admindoctor');
    const currentRole = user.roles?.[0];
    const canDelete = currentRole === 'admindoctor' || (currentRole === 'admin' && !isSuper);
    
    if (!canDelete) {
      Alert.alert('Access Denied', 'You cannot delete this personnel');
      return;
    }

    Alert.alert(
      'Confirm Delete',
      'Are you sure you want to remove this staff member?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setPersonnel(prev => prev.filter(p => p.id !== id));
            Alert.alert('Success', 'Personnel removed successfully');
          }
        }
      ]
    );
  };

  const handleSaveHospital = async () => {
    if (!activeCenter?.id) return;
    setSavingHospital(true);
    try {
      await apiClient.put(`/hospitals/${activeCenter.id}`, {
        hospitalName: hospitalData.hospitalName,
        hospitalAddress: hospitalData.hospitalAddress,
        gstin: hospitalData.gstin,
        registrationNumber: hospitalData.registrationNumber,
        pan: hospitalData.pan,
        nabhNumber: hospitalData.nabhNumber
      });
      Alert.alert('Success', 'Hospital configuration updated');
      fetchHospitalData();
    } catch (error) {
      console.error('[MOBILE ADMIN] Update hospital failed:', error);
      Alert.alert('Error', 'Failed to update configuration');
    } finally {
      setSavingHospital(false);
    }
  };

  if (!isAdmin) {
    return (
      <View style={styles.accessDenied}>
        <Shield size={64} color={COLORS.error} />
        <Text style={styles.accessDeniedTitle}>ACCESS DENIED</Text>
        <Text style={styles.accessDeniedText}>
          Administrative privileges required
        </Text>
      </View>
    );
  }

  const stats = [
    {
      title: 'TODAY\'S MISSIONS',
      value: todayAppointments.length,
      subtitle: `${confirmedToday} confirmed`,
      icon: Calendar,
      color: COLORS.cyan,
      gradient: [COLORS.cyan, '#4facfe'],
      trend: '+12%'
    },
    {
      title: 'ACTIVE PATIENTS',
      value: patients.length,
      subtitle: 'Total registry',
      icon: Users,
      color: COLORS.indigo,
      gradient: [COLORS.indigo, '#a29bfe'],
      trend: '+8%'
    },
    {
      title: 'MEDICAL STAFF',
      value: personnel.length,
      subtitle: 'On duty',
      icon: UserCheck,
      color: COLORS.gold,
      gradient: [COLORS.gold, '#ffeaa7'],
      trend: 'Stable'
    },
    {
      title: 'URGENT CASES',
      value: urgentAppointments,
      subtitle: 'Require attention',
      icon: AlertTriangle,
      color: COLORS.error,
      gradient: [COLORS.error, '#ff7675'],
      trend: '-5%'
    }
  ];

  // Pull to refresh handler
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (activeTab === 'PERSONNEL') {
        await fetchPersonnel();
      } else if (activeTab === 'HOSPITAL') {
        await fetchHospitalData();
      }
    } catch (error) {
      console.error('[MOBILE ADMIN] Refresh failed:', error);
    } finally {
      setRefreshing(false);
    }
  }, [activeTab, fetchPersonnel, fetchHospitalData]);

  const TabButton = ({ value, label, icon: Icon }) => (
    <TouchableOpacity
      style={[
        styles.tabBtn,
        activeTab === value && styles.tabBtnActive
      ]}
      onPress={() => setActiveTab(value)}
    >
      <Icon size={16} color={activeTab === value ? COLORS.bgMain : COLORS.textSecondary} />
      <Text style={[
        styles.tabBtnText,
        activeTab === value && styles.tabBtnTextActive
      ]}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  const PersonnelCard = ({ person }) => {
    const roleMeta = ROLE_META[person.roles[0]] || ROLE_META.doctor;
    const currentRole = user.roles?.[0];
    const isSuper = person.roles.includes('admindoctor');
    const canEdit = currentRole === 'admindoctor' || (currentRole === 'admin' && !isSuper);

    return (
      <View style={styles.personnelCard}>
        <View style={[styles.roleAccent, { backgroundColor: roleMeta.color }]} />
        
        <View style={styles.personnelHeader}>
          <View style={styles.personnelInfo}>
            <View style={[styles.personnelAvatar, { backgroundColor: roleMeta.bg }]}>
              <Text style={[styles.personnelInitial, { color: roleMeta.color }]}>
                {person.fullName?.charAt(0) || '?'}
              </Text>
            </View>
            <View style={styles.personnelDetails}>
              <Text style={styles.personnelName}>{person.fullName?.toUpperCase() || 'UNKNOWN'}</Text>
              <Text style={styles.personnelId}>PRO-SECURE-DEPL-{person.userId?.substring(0, 8)}</Text>
            </View>
          </View>
          <View style={[styles.roleBadge, { backgroundColor: roleMeta.bg }]}>
            <Text style={[styles.roleBadgeText, { color: roleMeta.color }]}>
              {roleMeta.label.toUpperCase()}
            </Text>
          </View>
        </View>

        <View style={styles.personnelCredentials}>
          <View style={styles.credentialRow}>
            <Text style={styles.credentialLabel}>SYSTEM IDENTITY</Text>
            <Text style={styles.credentialValue}>{person.email}</Text>
          </View>
          <View style={styles.credentialDivider} />
          <View style={styles.credentialRow}>
            <Text style={styles.credentialLabel}>ACCESS KEY</Text>
            <Text style={styles.credentialPassword}>{person.password}</Text>
          </View>
        </View>

        <View style={styles.personnelFooter}>
          <View style={styles.statusInfo}>
            <View style={styles.statusItem}>
              <Text style={styles.statusLabel}>LAST ACTIVE</Text>
              <Text style={styles.statusValue}>{person.lastLogin || 'OFFLINE'}</Text>
            </View>
            <View style={styles.statusDivider} />
            <View style={styles.statusItem}>
              <Text style={styles.statusLabel}>STATUS</Text>
              <Text style={[styles.statusValue, { 
                color: person.status === 'active' ? COLORS.success : COLORS.textSecondary 
              }]}>
                {(person.status || 'ACTIVE').toUpperCase()}
              </Text>
            </View>
          </View>

          <View style={styles.personnelActions}>
            {canEdit ? (
              <>
                <TouchableOpacity
                  style={styles.editBtn}
                  onPress={() => handleOpenPersonnelModal(person)}
                >
                  <Edit3 size={12} color={COLORS.textPrimary} />
                  <Text style={styles.editBtnText}>EDIT</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => handleDeletePersonnel(person.userId, person.roles)}
                >
                  <Trash2 size={12} color={COLORS.error} />
                </TouchableOpacity>
              </>
            ) : (
              <View style={styles.protectedBadge}>
                <Shield size={12} color={COLORS.textSecondary} />
                <Text style={styles.protectedText}>PROTECTED</Text>
              </View>
            )}
          </View>
        </View>
      </View>
    );
  };

  const renderIntelligence = () => {
    // Calculate additional statistics for enhanced analytics
    const todayReferrals = appointments.filter(apt => {
      const today = new Date().toISOString().split('T')[0];
      return apt.date === today;
    });
    
    const financialYield = todayReferrals.length * 85; // Mock calculation
    const avgLatency = '38m'; // Mock data
    
    // Mock modality data for charts
    const modalityStats = [
      { label: 'X-RAY', count: 245, color: '#0f52ba' },
      { label: 'CT SCAN', count: 180, color: '#6c5ce7' },
      { label: 'MRI', count: 125, color: '#e74c3c' },
      { label: 'ULTRASOUND', count: 285, color: '#2ecc71' }
    ];
    
    const totalModalityCount = modalityStats.reduce((acc, m) => acc + m.count, 0);
    
    // Daily volume mock data
    const dailyVolume = [
      { day: 'MON', count: 85, peak: false },
      { day: 'TUE', count: 92, peak: false },
      { day: 'WED', count: 118, peak: true },
      { day: 'THU', count: 76, peak: false },
      { day: 'FRI', count: 89, peak: false },
      { day: 'SAT', count: 45, peak: false },
      { day: 'SUN', count: 32, peak: false }
    ];

    return (
      <ScrollView 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.cyan}
            colors={[COLORS.cyan]}
          />
        }
      >
        {/* Date Filter Controls */}
        <View style={styles.analyticsFilterContainer}>
          <Text style={styles.analyticsFilterLabel}>GOVERNANCE INTENSITY:</Text>
          <View style={styles.analyticsFilterButtons}>
            <TouchableOpacity style={styles.analyticsFilterBtn}>
              <Text style={styles.analyticsFilterBtnText}>TODAY</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.analyticsFilterBtn}>
              <Text style={styles.analyticsFilterBtnText}>YESTERDAY</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Primary Statistics Grid - Using AnimatedStatCard */}
        <View style={styles.statsGrid}>
          {stats.map((stat, index) => (
            <AnimatedStatCard
              key={index}
              title={stat.title}
              value={stat.value}
              icon={stat.icon}
              color={stat.color}
              gradient={stat.gradient}
              animated={true}
              pulse={stat.title === 'URGENT CASES' && stat.value > 0}
            />
          ))}
        </View>

        {/* Enhanced KPI Cards */}
        <View style={styles.enhancedKpiGrid}>
          {/* Universal Registry - Primary Card */}
          <View style={[styles.enhancedKpiCard, styles.enhancedKpiCardPrimary]}>
            <Text style={styles.enhancedKpiLabel}>UNIVERSAL REGISTRY</Text>
            <View style={styles.enhancedKpiValueContainer}>
              <Text style={styles.enhancedKpiValuePrimary}>{patients.length}</Text>
              <Text style={styles.enhancedKpiUnit}>UNITS</Text>
            </View>
            <Text style={styles.enhancedKpiTrend}>LIVE CLOUD SYNC ACTIVE</Text>
          </View>

          {/* Strategic Volume */}
          <View style={styles.enhancedKpiCard}>
            <Text style={styles.enhancedKpiLabel}>STRATEGIC VOLUME</Text>
            <View style={styles.enhancedKpiValueContainer}>
              <Text style={styles.enhancedKpiValue}>{todayReferrals.length}</Text>
              <Text style={styles.enhancedKpiUnit}>MISSIONS</Text>
            </View>
            <View style={styles.enhancedKpiGrowthBadge}>
              <Text style={styles.enhancedKpiGrowthText}>↑ 14% OPS GROWTH</Text>
            </View>
          </View>

          {/* Financial Yield */}
          <View style={styles.enhancedKpiCard}>
            <Text style={styles.enhancedKpiLabel}>FINANCIAL YIELD</Text>
            <View style={styles.enhancedKpiValueContainer}>
              <Text style={styles.enhancedKpiCurrency}>$</Text>
              <Text style={[styles.enhancedKpiValue, { color: COLORS.success }]}>{financialYield}</Text>
            </View>
            <View style={styles.enhancedKpiProgressBar}>
              <View style={[styles.enhancedKpiProgress, { width: '75%' }]} />
            </View>
            <Text style={styles.enhancedKpiProgressText}>TARGET ATTAINMENT: 75%</Text>
          </View>

          {/* Command Latency */}
          <View style={styles.enhancedKpiCard}>
            <Text style={styles.enhancedKpiLabel}>COMMAND LATENCY</Text>
            <View style={styles.enhancedKpiValueContainer}>
              <Text style={[styles.enhancedKpiValue, { color: COLORS.error }]}>{avgLatency}</Text>
              <Text style={styles.enhancedKpiUnit}>AVG</Text>
            </View>
            <View style={styles.enhancedKpiIndicators}>
              {[1,2,3,4,5].map(i => (
                <View 
                  key={i} 
                  style={[
                    styles.enhancedKpiIndicator,
                    { backgroundColor: i <= 3 ? COLORS.error : COLORS.border }
                  ]} 
                />
              ))}
            </View>
            <Text style={[styles.enhancedKpiAlert, { color: COLORS.error }]}>
              CRITICAL PEAK FLOW DETECTED
            </Text>
          </View>
        </View>

        {/* Clinical Modality Intelligence */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>CLINICAL MODALITY INTEL</Text>
          <View style={styles.modalityCard}>
            <View style={styles.modalityHeader}>
              <Text style={styles.modalityTitle}>Equipment Utilization Matrix</Text>
              <Text style={styles.modalityTotal}>TOTAL: {totalModalityCount} UNITS</Text>
            </View>
            
            <View style={styles.modalityContent}>
              {/* Donut Chart Representation */}
              <View style={styles.modalityChartContainer}>
                <View style={styles.modalityDonut}>
                  <Text style={styles.modalityDonutValue}>{totalModalityCount}</Text>
                  <Text style={styles.modalityDonutLabel}>TOTAL</Text>
                </View>
              </View>
              
              {/* Modality Legend */}
              <View style={styles.modalityLegend}>
                {modalityStats.map((modality, index) => (
                  <View key={modality.label} style={styles.modalityLegendItem}>
                    <View style={styles.modalityLegendRow}>
                      <View style={styles.modalityLegendInfo}>
                        <View style={[styles.modalityLegendColor, { backgroundColor: modality.color }]} />
                        <Text style={styles.modalityLegendLabel}>{modality.label}</Text>
                      </View>
                      <Text style={styles.modalityLegendValue}>
                        {modality.count} ({Math.round((modality.count/totalModalityCount)*100)}%)
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          </View>
        </View>

        {/* Daily Volume Chart */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>OPERATIONAL PEAK MATRIX</Text>
          <View style={styles.dailyVolumeCard}>
            <Text style={styles.dailyVolumeTitle}>Daily Throughput Analysis</Text>
            <View style={styles.dailyVolumeChart}>
              {dailyVolume.map((day, index) => (
                <View key={day.day} style={styles.dailyVolumeBar}>
                  <View style={styles.dailyVolumeBarContainer}>
                    <View 
                      style={[
                        styles.dailyVolumeBarFill,
                        { 
                          height: `${(day.count / 120) * 100}%`,
                          backgroundColor: day.peak ? COLORS.error : COLORS.cyan
                        }
                      ]}
                    />
                    <Text style={[
                      styles.dailyVolumeBarValue,
                      { color: day.peak ? COLORS.error : COLORS.textSecondary }
                    ]}>
                      {day.count}
                    </Text>
                  </View>
                  <Text style={styles.dailyVolumeBarLabel}>{day.day}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* System Overview */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SYSTEM OVERVIEW</Text>
          <View style={styles.overviewCard}>
            <View style={styles.overviewRow}>
              <View style={styles.overviewItem}>
                <Database size={16} color={COLORS.cyan} />
                <Text style={styles.overviewLabel}>Database</Text>
                <Text style={styles.overviewValue}>Online</Text>
              </View>
              <View style={styles.overviewItem}>
                <Zap size={16} color={COLORS.success} />
                <Text style={styles.overviewLabel}>Performance</Text>
                <Text style={styles.overviewValue}>Optimal</Text>
              </View>
            </View>
            <View style={styles.overviewRow}>
              <View style={styles.overviewItem}>
                <Activity size={16} color={COLORS.gold} />
                <Text style={styles.overviewLabel}>Load</Text>
                <Text style={styles.overviewValue}>Normal</Text>
              </View>
              <View style={styles.overviewItem}>
                <Shield size={16} color={COLORS.indigo} />
                <Text style={styles.overviewLabel}>Security</Text>
                <Text style={styles.overviewValue}>Secure</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Demographics Analysis */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>DEMOGRAPHIC INTELLIGENCE</Text>
          <View style={styles.demographicsGrid}>
            {/* Gender Distribution */}
            <View style={styles.demographicsCard}>
              <Text style={styles.demographicsCardTitle}>Gender Identity Matrix</Text>
              <View style={styles.genderAnalysis}>
                <View style={styles.genderItem}>
                  <View style={styles.genderIcon}>
                    <Text style={styles.genderEmoji}>♂️</Text>
                  </View>
                  <View style={styles.genderData}>
                    <View style={styles.genderHeader}>
                      <Text style={styles.genderLabel}>MALE BIOLOGY</Text>
                      <Text style={styles.genderPercentage}>58%</Text>
                    </View>
                    <View style={styles.genderProgressBar}>
                      <View style={[styles.genderProgress, { width: '58%', backgroundColor: COLORS.cyan }]} />
                    </View>
                  </View>
                </View>
                
                <View style={styles.genderItem}>
                  <View style={styles.genderIcon}>
                    <Text style={styles.genderEmoji}>♀️</Text>
                  </View>
                  <View style={styles.genderData}>
                    <View style={styles.genderHeader}>
                      <Text style={styles.genderLabel}>FEMALE BIOLOGY</Text>
                      <Text style={styles.genderPercentage}>42%</Text>
                    </View>
                    <View style={styles.genderProgressBar}>
                      <View style={[styles.genderProgress, { width: '42%', backgroundColor: '#e84393' }]} />
                    </View>
                  </View>
                </View>
                
                <View style={styles.genderInsight}>
                  <Text style={styles.genderInsightText}>
                    CORE PATIENT SEGMENT: ADULT MALE (35-50)
                  </Text>
                </View>
              </View>
            </View>

            {/* Age Stratification */}
            <View style={styles.demographicsCard}>
              <Text style={styles.demographicsCardTitle}>Age Stratification Intel</Text>
              <View style={styles.ageAnalysis}>
                {[
                  { label: '0-18 (Paediatric)', percentage: 15, count: 125, color: '#00cec9', desc: 'Growth & Development' },
                  { label: '19-45 (Adult)', percentage: 45, count: 375, color: COLORS.cyan, desc: 'Active Operational' },
                  { label: '46-65 (Mature)', percentage: 25, count: 210, color: COLORS.gold, desc: 'Systemic Screen' },
                  { label: '66+ (Geriatric)', percentage: 15, count: 125, color: COLORS.error, desc: 'Critical Care' }
                ].map((tier, index) => (
                  <View key={tier.label} style={styles.ageItem}>
                    <View style={styles.ageHeader}>
                      <View style={styles.ageInfo}>
                        <Text style={styles.ageLabel}>{tier.label.toUpperCase()}</Text>
                        <Text style={styles.ageDesc}>{tier.desc}</Text>
                      </View>
                      <Text style={[styles.agePercentage, { color: tier.color }]}>
                        {tier.percentage}%
                      </Text>
                    </View>
                    <View style={styles.ageProgressBar}>
                      <View style={[
                        styles.ageProgress, 
                        { width: `${tier.percentage}%`, backgroundColor: tier.color }
                      ]} />
                    </View>
                  </View>
                ))}
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    );
  };

  const renderPersonnel = () => (
    <View style={styles.personnelContainer}>
      <View style={styles.personnelHeader}>
        <View>
          <Text style={styles.personnelTitle}>Hospital Personnel Roster</Text>
          <Text style={styles.personnelSubtitle}>
            Active deployment and credential management for clinical staff
          </Text>
        </View>
        <GradientButton
          title="ADD"
          icon={Plus}
          onPress={() => handleOpenPersonnelModal()}
          size="sm"
        />
      </View>

      {personnelLoading ? (
        <View style={styles.loadingContainer}>
          <Activity size={24} color={COLORS.cyan} />
          <Text style={styles.loadingText}>SYNCHRONIZING PERSONNEL...</Text>
        </View>
      ) : personnel.length === 0 ? (
        <EmptyState
          icon={Users}
          title="NO PERSONNEL DEPLOYED"
          subtitle="Add medical staff to begin operational management"
          actionText="ADD FIRST STAFF MEMBER"
          onAction={() => handleOpenPersonnelModal()}
        />
      ) : (
        <FlatList
          data={personnel}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => <PersonnelCard person={item} />}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.personnelList}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.cyan}
              colors={[COLORS.cyan]}
            />
          }
        />
      )}
    </View>
  );

  const renderReferralIntel = () => {
    // Use actual patients data from context instead of mock data
    const patientsData = patients.length > 0 ? patients : mockPatients;
    
    // Format dates for comparison (YYYY-MM-DD)
    const startDateStr = referralRange.start.toISOString().split('T')[0];
    const endDateStr = referralRange.end.toISOString().split('T')[0];
    
    // Aggregate data based on range
    const aggregated = patientsData.reduce((acc, p) => {
      const isMatched = referralFilterMode === 'SINGLE' 
        ? p.registered === startDateStr
        : (p.registered >= startDateStr && p.registered <= endDateStr);

      if (isMatched) {
        const source = p.referredBy || 'Direct / Walk-in';
        if (!acc[source]) {
          acc[source] = {
            name: source,
            contact: p.sourceContact || 'N/A',
            patients: []
          };
        }
        acc[source].patients.push(p);
      }
      return acc;
    }, {});

    const sources = Object.values(aggregated).sort((a, b) => b.patients.length - a.patients.length);
    const totalCaptured = Object.values(aggregated).reduce((sum, s) => sum + s.patients.length, 0);

    const ReferralSourceCard = ({ source }) => {
      const isExpanded = expandedReferrer === source.name;
      
      return (
        <View style={[
          styles.referralSourceCard,
          isExpanded && styles.referralSourceCardExpanded
        ]}>
          <TouchableOpacity
            style={styles.referralSourceHeader}
            onPress={() => setExpandedReferrer(isExpanded ? null : source.name)}
          >
            <View style={styles.referralSourceInfo}>
              <View style={styles.referralSourceIcon}>
                <Text style={styles.referralSourceEmoji}>📡</Text>
              </View>
              <View style={styles.referralSourceDetails}>
                <Text style={styles.referralSourceName}>{source.name.toUpperCase()}</Text>
                <Text style={styles.referralSourceContact}>RECON: {source.contact}</Text>
              </View>
            </View>
            
            <View style={styles.referralSourceFooter}>
              <View style={styles.referralSourceStats}>
                <Text style={styles.referralSourceCount}>{source.patients.length}</Text>
                <Text style={styles.referralSourceLabel}>MISSIONS</Text>
              </View>
              <View style={[
                styles.referralSourceToggle,
                isExpanded && styles.referralSourceToggleActive
              ]}>
                <Text style={[
                  styles.referralSourceToggleText,
                  isExpanded && styles.referralSourceToggleTextActive
                ]}>
                  {isExpanded ? 'COMPLETE' : 'LOGS ↓'}
                </Text>
              </View>
            </View>
          </TouchableOpacity>

          {isExpanded && (
            <View style={styles.referralSourceExpanded}>
              <View style={styles.referralPatientsList}>
                <View style={styles.referralPatientsHeader}>
                  <Text style={styles.referralPatientsHeaderText}>MISSION ID</Text>
                  <Text style={styles.referralPatientsHeaderText}>TARGET NAME</Text>
                  <Text style={styles.referralPatientsHeaderText}>DEMO</Text>
                  <Text style={styles.referralPatientsHeaderText}>DEPLOYED</Text>
                </View>
                {source.patients.map((patient) => (
                  <View key={patient.id} style={styles.referralPatientRow}>
                    <Text style={styles.referralPatientId}>{patient.id}</Text>
                    <Text style={styles.referralPatientName}>{patient.name.toUpperCase()}</Text>
                    <Text style={styles.referralPatientDemo}>{patient.age}y / {patient.gender[0]}</Text>
                    <Text style={styles.referralPatientDate}>{patient.registered}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>
      );
    };

    return (
      <ScrollView style={styles.referralIntelContainer} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.referralIntelHeader}>
          <View>
            <Text style={styles.referralIntelTitle}>Source Intelligence Matrix</Text>
            <Text style={styles.referralIntelSubtitle}>
              Deep-recon analysis of patient acquisition channels and source attribution
            </Text>
          </View>
        </View>

        {/* Filter Controls */}
        <View style={styles.referralFilterContainer}>
          <View style={styles.referralModeToggle}>
            <TouchableOpacity
              style={[
                styles.referralModeBtn,
                referralFilterMode === 'SINGLE' && styles.referralModeBtnActive
              ]}
              onPress={() => setReferralFilterMode('SINGLE')}
            >
              <Text style={[
                styles.referralModeBtnText,
                referralFilterMode === 'SINGLE' && styles.referralModeBtnTextActive
              ]}>
                SINGLE SCAN
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.referralModeBtn,
                referralFilterMode === 'RANGE' && styles.referralModeBtnActive
              ]}
              onPress={() => setReferralFilterMode('RANGE')}
            >
              <Text style={[
                styles.referralModeBtnText,
                referralFilterMode === 'RANGE' && styles.referralModeBtnTextActive
              ]}>
                TEMPORAL RANGE
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.referralDateContainer}>
            <TouchableOpacity
              style={styles.referralDateButton}
              onPress={() => setShowStartDatePicker(true)}
            >
              <Calendar size={16} color={COLORS.cyan} />
              <Text style={styles.referralDateButtonText}>
                {referralRange.start.toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric'
                })}
              </Text>
            </TouchableOpacity>
            {referralFilterMode === 'RANGE' && (
              <>
                <Text style={styles.referralDateArrow}>→</Text>
                <TouchableOpacity
                  style={styles.referralDateButton}
                  onPress={() => setShowEndDatePicker(true)}
                >
                  <Calendar size={16} color={COLORS.cyan} />
                  <Text style={styles.referralDateButtonText}>
                    {referralRange.end.toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric'
                    })}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>

          {/* Start Date Picker */}
          {showStartDatePicker && (
            <DateTimePicker
              value={referralRange.start}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={(event, selectedDate) => {
                setShowStartDatePicker(Platform.OS === 'ios');
                if (selectedDate) {
                  setReferralRange(prev => ({ ...prev, start: selectedDate }));
                }
              }}
            />
          )}

          {/* End Date Picker */}
          {showEndDatePicker && (
            <DateTimePicker
              value={referralRange.end}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              minimumDate={referralRange.start}
              onChange={(event, selectedDate) => {
                setShowEndDatePicker(Platform.OS === 'ios');
                if (selectedDate) {
                  setReferralRange(prev => ({ ...prev, end: selectedDate }));
                }
              }}
            />
          )}
        </View>

        {/* Summary Statistics */}
        <View style={styles.referralSummaryGrid}>
          <View style={styles.referralSummaryCard}>
            <Text style={styles.referralSummaryLabel}>TOTAL CAPTURED</Text>
            <View style={styles.referralSummaryValueContainer}>
              <Text style={styles.referralSummaryValue}>{totalCaptured}</Text>
              <Text style={styles.referralSummaryUnit}>SCAN UNITS</Text>
            </View>
          </View>
          
          <View style={styles.referralSummaryCard}>
            <Text style={styles.referralSummaryLabel}>ACTIVE CHANNELS</Text>
            <Text style={styles.referralSummaryValue}>{sources.length}</Text>
          </View>
          
          <View style={[styles.referralSummaryCard, styles.referralSummaryCardPrimary]}>
            <Text style={styles.referralSummaryLabelPrimary}>DOMINANT PROTOCOL</Text>
            <Text style={styles.referralSummaryValuePrimary}>
              {sources[0]?.name || 'N/A'}
            </Text>
          </View>
        </View>

        {/* Referral Sources List */}
        <View style={styles.referralSourcesList}>
          {sources.length > 0 ? (
            sources.map((source) => (
              <ReferralSourceCard key={source.name} source={source} />
            ))
          ) : (
            <View style={styles.referralEmptyState}>
              <Text style={styles.referralEmptyIcon}>📡</Text>
              <Text style={styles.referralEmptyTitle}>NO SIGNAL DETECTED</Text>
              <Text style={styles.referralEmptySubtitle}>
                Temporal scan in the current range yielded zero patient acquisition.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    );
  };
  const renderHospital = () => (
    <ScrollView 
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={COLORS.cyan}
          colors={[COLORS.cyan]}
        />
      }
    >
      <View style={styles.hospitalContainer}>
        <View style={styles.hospitalHeader}>
          <Text style={styles.hospitalTitle}>Infrastructure Configuration</Text>
          <Text style={styles.hospitalSubtitle}>
            Manage institutional identity, tax compliance nodes, and clinical accreditations
          </Text>
        </View>

        {hospitalLoading ? (
          <View style={styles.loadingContainer}>
            <Activity size={24} color={COLORS.cyan} />
            <Text style={styles.loadingText}>ESTABLISHING SECURE LINK...</Text>
          </View>
        ) : (
          <View style={styles.hospitalForm}>
            <View style={styles.formRow}>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>INSTITUTIONAL IDENTITY</Text>
                <TextInput
                  style={styles.formInput}
                  value={hospitalData.hospitalName}
                  onChangeText={(text) => setHospitalData({...hospitalData, hospitalName: text})}
                  placeholder="Hospital Name"
                  placeholderTextColor={COLORS.textSecondary}
                />
              </View>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>OPERATIONAL LICENSE #</Text>
                <TextInput
                  style={styles.formInput}
                  value={hospitalData.registrationNumber}
                  onChangeText={(text) => setHospitalData({...hospitalData, registrationNumber: text.toUpperCase()})}
                  placeholder="State Reg / UID"
                  placeholderTextColor={COLORS.textSecondary}
                />
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>PHYSICAL INFRASTRUCTURE NODE</Text>
              <TextInput
                style={[styles.formInput, styles.textArea]}
                value={hospitalData.hospitalAddress}
                onChangeText={(text) => setHospitalData({...hospitalData, hospitalAddress: text})}
                placeholder="Complete clinical facility address..."
                placeholderTextColor={COLORS.textSecondary}
                multiline
                numberOfLines={3}
              />
            </View>

            <View style={styles.complianceSection}>
              <Text style={styles.complianceTitle}>COMPLIANCE & ACCREDITATION</Text>
              <View style={styles.complianceGrid}>
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>GSTIN MODULE</Text>
                  <TextInput
                    style={styles.formInput}
                    value={hospitalData.gstin}
                    onChangeText={(text) => setHospitalData({...hospitalData, gstin: text.toUpperCase()})}
                    placeholder="15-Digit GST"
                    placeholderTextColor={COLORS.textSecondary}
                    maxLength={15}
                  />
                </View>
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>IT PAN NODE</Text>
                  <TextInput
                    style={styles.formInput}
                    value={hospitalData.pan}
                    onChangeText={(text) => setHospitalData({...hospitalData, pan: text.toUpperCase()})}
                    placeholder="10-Digit PAN"
                    placeholderTextColor={COLORS.textSecondary}
                    maxLength={10}
                  />
                </View>
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>QUALITY (NABH/NABL)</Text>
                  <TextInput
                    style={styles.formInput}
                    value={hospitalData.nabhNumber}
                    onChangeText={(text) => setHospitalData({...hospitalData, nabhNumber: text.toUpperCase()})}
                    placeholder="CERT-XXXXX"
                    placeholderTextColor={COLORS.textSecondary}
                  />
                </View>
              </View>
            </View>

            <GradientButton
              title={savingHospital ? 'SYNCHRONIZING...' : 'COMMIT CHANGES'}
              onPress={handleSaveHospital}
              loading={savingHospital}
              disabled={savingHospital}
              size="lg"
              style={{ marginTop: SPACING.xl }}
            />
          </View>
        )}
      </View>
    </ScrollView>
  );

  return (
    <View style={styles.container}>
      {/* Header with Gradient */}
      <LinearGradient
        colors={['rgba(15, 82, 186, 0.15)', 'rgba(15, 82, 186, 0.05)', 'transparent']}
        style={styles.headerGradient}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.welcomeText}>OPERATIONAL COMMAND</Text>
            <Text style={styles.adminName}>Administrator: {user?.name}</Text>
          </View>
          <View style={styles.statusIndicator}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>OPERATIONAL</Text>
          </View>
        </View>
      </LinearGradient>

      {/* Tab Navigation */}
      <View style={styles.tabContainer}>
        <TabButton value="INTELLIGENCE" label="INTEL" icon={BarChart3} />
        <TabButton value="REFERRAL_INTEL" label="REFERRAL" icon={TrendingUp} />
        <TabButton value="PERSONNEL" label="STAFF" icon={Users} />
        <TabButton value="HOSPITAL" label="CONFIG" icon={Building2} />
      </View>

      {/* Tab Content */}
      <View style={styles.tabContent}>
        {activeTab === 'INTELLIGENCE' && renderIntelligence()}
        {activeTab === 'REFERRAL_INTEL' && renderReferralIntel()}
        {activeTab === 'PERSONNEL' && renderPersonnel()}
        {activeTab === 'HOSPITAL' && renderHospital()}
      </View>

      {/* Personnel Modal */}
      <Modal
        visible={isPersonnelModalOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setIsPersonnelModalOpen(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>
                {editUser?.id ? 'CONFIG_IDENTITY' : 'INIT_REGISTRATION'}
              </Text>
              <Text style={styles.modalSubtitle}>Personnel Deployment</Text>
            </View>
            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => setIsPersonnelModalOpen(false)}
            >
              <X size={24} color={COLORS.textPrimary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
            <View style={styles.modalForm}>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>FULL NAME *</Text>
                <TextInput
                  style={styles.formInput}
                  value={editUser?.name || ''}
                  onChangeText={(text) => setEditUser({...editUser, name: text})}
                  placeholder="Enter full name"
                  placeholderTextColor={COLORS.textSecondary}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>EMAIL ADDRESS *</Text>
                <TextInput
                  style={styles.formInput}
                  value={editUser?.email || ''}
                  onChangeText={(text) => setEditUser({...editUser, email: text})}
                  placeholder="Enter email address"
                  placeholderTextColor={COLORS.textSecondary}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>MOBILE NUMBER *</Text>
                <TextInput
                  style={styles.formInput}
                  value={editUser?.mobile || ''}
                  onChangeText={(text) => setEditUser({...editUser, mobile: text})}
                  placeholder="Enter mobile number"
                  placeholderTextColor={COLORS.textSecondary}
                  keyboardType="phone-pad"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>PASSWORD</Text>
                <View style={styles.passwordContainer}>
                  <TextInput
                    style={styles.passwordInput}
                    value={editUser?.password || ''}
                    onChangeText={(text) => setEditUser({...editUser, password: text})}
                    placeholder="Enter password"
                    placeholderTextColor={COLORS.textSecondary}
                    secureTextEntry={!showPassword}
                  />
                  <TouchableOpacity
                    style={styles.passwordToggle}
                    onPress={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff size={16} color={COLORS.textSecondary} />
                    ) : (
                      <Eye size={16} color={COLORS.textSecondary} />
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>ROLE</Text>
                <View style={styles.roleContainer}>
                  {Object.keys(ROLE_META).map((role) => (
                    <TouchableOpacity
                      key={role}
                      style={[
                        styles.roleOption,
                        editUser?.roles?.[0] === role && styles.roleOptionActive
                      ]}
                      onPress={() => setEditUser({...editUser, roles: [role]})}
                    >
                      <Text style={[
                        styles.roleOptionText,
                        editUser?.roles?.[0] === role && styles.roleOptionTextActive
                      ]}>
                        {ROLE_META[role].label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>SPECIALIZATION</Text>
                <TextInput
                  style={styles.formInput}
                  value={editUser?.specialization || ''}
                  onChangeText={(text) => setEditUser({...editUser, specialization: text})}
                  placeholder="Enter specialization"
                  placeholderTextColor={COLORS.textSecondary}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>DEGREE</Text>
                <TextInput
                  style={styles.formInput}
                  value={editUser?.degree || ''}
                  onChangeText={(text) => setEditUser({...editUser, degree: text})}
                  placeholder="Enter degree"
                  placeholderTextColor={COLORS.textSecondary}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>LICENSE NUMBER</Text>
                <TextInput
                  style={styles.formInput}
                  value={editUser?.licenseNo || ''}
                  onChangeText={(text) => setEditUser({...editUser, licenseNo: text})}
                  placeholder="Enter license number"
                  placeholderTextColor={COLORS.textSecondary}
                />
              </View>
            </View>
          </ScrollView>

          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={styles.modalCancelBtn}
              onPress={() => setIsPersonnelModalOpen(false)}
            >
              <Text style={styles.modalCancelText}>CANCEL</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalSaveBtn}
              onPress={handleSavePersonnel}
            >
              <Text style={styles.modalSaveText}>
                {editUser?.id ? 'UPDATE' : 'DEPLOY'} PERSONNEL
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Bottom Navigation Bar */}
      <BottomNavBar userRole={user?.roles?.[0] || 'admin'} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgMain,
  },
  headerGradient: {
    paddingTop: SPACING.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  welcomeText: {
    fontSize: 10,
    color: COLORS.cyan,
    fontWeight: '900',
    letterSpacing: 2,
  },
  adminName: {
    fontSize: 20,
    color: COLORS.textPrimary,
    fontWeight: '900',
    marginTop: 4,
  },
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.success,
    marginRight: 6,
  },
  statusText: {
    fontSize: 10,
    color: COLORS.success,
    fontWeight: '700',
    letterSpacing: 1,
  },
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.lg,
    backgroundColor: 'rgba(15, 82, 186, 0.03)',
    marginHorizontal: SPACING.lg,
    borderRadius: RADIUS.lg,
    padding: 6,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    gap: 6,
  },
  tabBtnActive: {
    backgroundColor: COLORS.bgCard,
    ...SHADOWS.sm,
  },
  tabBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 1,
  },
  tabBtnTextActive: {
    color: COLORS.textPrimary,
  },
  tabContent: {
    flex: 1,
    paddingHorizontal: SPACING.lg,
    paddingBottom: 80, // Space for bottom navigation
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
    marginBottom: SPACING.lg,
  },
  section: {
    marginBottom: SPACING.lg,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: COLORS.cyan,
    letterSpacing: 2,
    marginBottom: SPACING.md,
  },
  overviewCard: {
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  overviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  overviewItem: {
    flex: 1,
    alignItems: 'center',
  },
  overviewLabel: {
    fontSize: 10,
    color: COLORS.textSecondary,
    marginTop: 4,
    marginBottom: 2,
  },
  overviewValue: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  // Personnel Tab Styles
  personnelContainer: {
    flex: 1,
  },
  personnelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.lg,
  },
  personnelTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: COLORS.textSecondary,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  personnelSubtitle: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xl * 2,
  },
  loadingText: {
    fontSize: 11,
    fontWeight: '900',
    color: COLORS.cyan,
    marginTop: SPACING.sm,
    letterSpacing: 1,
  },
  personnelList: {
    paddingBottom: SPACING.xl,
  },
  personnelCard: {
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    position: 'relative',
    overflow: 'hidden',
  },
  roleAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 4,
    bottom: 0,
  },
  personnelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.md,
  },
  personnelInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  personnelAvatar: {
    width: 50,
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  personnelInitial: {
    fontSize: 20,
    fontWeight: '900',
  },
  personnelDetails: {
    flex: 1,
  },
  personnelName: {
    fontSize: 16,
    fontWeight: '900',
    color: COLORS.textPrimary,
    letterSpacing: -0.3,
  },
  personnelId: {
    fontSize: 8,
    color: COLORS.textSecondary,
    fontWeight: '800',
    marginTop: 4,
  },
  roleBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: RADIUS.xl,
  },
  roleBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
  },
  personnelCredentials: {
    backgroundColor: COLORS.bgMain,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  credentialRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  credentialLabel: {
    fontSize: 9,
    fontWeight: '900',
    color: COLORS.textSecondary,
    letterSpacing: 1,
  },
  credentialValue: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  credentialPassword: {
    fontSize: 11,
    fontWeight: '900',
    color: COLORS.cyan,
    fontFamily: 'monospace',
  },
  credentialDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: SPACING.sm,
  },
  personnelFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  statusItem: {
    alignItems: 'flex-start',
  },
  statusLabel: {
    fontSize: 8,
    fontWeight: '900',
    color: COLORS.textSecondary,
  },
  statusValue: {
    fontSize: 10,
    fontWeight: '900',
    color: COLORS.textPrimary,
    marginTop: 2,
  },
  statusDivider: {
    width: 1,
    height: 20,
    backgroundColor: COLORS.border,
  },
  personnelActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 6,
  },
  editBtnText: {
    fontSize: 10,
    fontWeight: '900',
    color: COLORS.textPrimary,
  },
  deleteBtn: {
    width: 34,
    height: 34,
    borderRadius: RADIUS.sm,
    backgroundColor: '#fff5f5',
    borderWidth: 1,
    borderColor: '#fecaca',
    alignItems: 'center',
    justifyContent: 'center',
  },
  protectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.bgMain,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 6,
  },
  protectedText: {
    fontSize: 9,
    fontWeight: '900',
    color: COLORS.textSecondary,
    letterSpacing: 1,
  },
  // Hospital Tab Styles
  hospitalContainer: {
    flex: 1,
  },
  hospitalHeader: {
    marginBottom: SPACING.xl,
  },
  hospitalTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: COLORS.cyan,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  hospitalSubtitle: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '600',
    marginTop: 4,
  },
  hospitalForm: {
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  formRow: {
    flexDirection: 'row',
    gap: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  formGroup: {
    flex: 1,
    marginBottom: SPACING.lg,
  },
  formLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: SPACING.sm,
  },
  formInput: {
    borderBottomWidth: 2,
    borderBottomColor: COLORS.border,
    fontSize: 16,
    fontWeight: '700',
    paddingVertical: SPACING.sm,
    color: COLORS.textPrimary,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  complianceSection: {
    backgroundColor: COLORS.bgMain,
    padding: SPACING.xl,
    borderRadius: RADIUS.xl,
    marginBottom: SPACING.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  complianceTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: COLORS.cyan,
    letterSpacing: 2,
    marginBottom: SPACING.lg,
  },
  complianceGrid: {
    gap: SPACING.lg,
  },
  saveBtn: {
    backgroundColor: COLORS.cyan,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    alignSelf: 'flex-end',
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    fontSize: 11,
    fontWeight: '900',
    color: COLORS.bgMain,
    letterSpacing: 1,
  },
  // Modal Styles
  modalContainer: {
    flex: 1,
    backgroundColor: COLORS.bgMain,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: SPACING.xl,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: COLORS.textPrimary,
    letterSpacing: -0.5,
  },
  modalSubtitle: {
    fontSize: 10,
    fontWeight: '900',
    color: COLORS.cyan,
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginTop: 4,
  },
  modalCloseBtn: {
    padding: SPACING.sm,
  },
  modalContent: {
    flex: 1,
    paddingHorizontal: SPACING.xl,
  },
  modalForm: {
    paddingVertical: SPACING.lg,
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: COLORS.border,
  },
  passwordInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    paddingVertical: SPACING.sm,
    color: COLORS.textPrimary,
  },
  passwordToggle: {
    padding: SPACING.sm,
  },
  roleContainer: {
    gap: SPACING.sm,
  },
  roleOption: {
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  roleOptionActive: {
    backgroundColor: COLORS.cyan,
    borderColor: COLORS.cyan,
  },
  roleOptionText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  roleOptionTextActive: {
    color: COLORS.bgMain,
  },
  modalFooter: {
    flexDirection: 'row',
    padding: SPACING.xl,
    gap: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 11,
    fontWeight: '900',
    color: COLORS.textSecondary,
  },
  modalSaveBtn: {
    flex: 2,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.cyan,
    alignItems: 'center',
  },
  modalSaveText: {
    fontSize: 11,
    fontWeight: '900',
    color: COLORS.bgMain,
    letterSpacing: 1,
  },
  accessDenied: {
    flex: 1,
    backgroundColor: COLORS.bgMain,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
  },
  accessDeniedTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: COLORS.error,
    marginTop: SPACING.lg,
    letterSpacing: 2,
  },
  accessDeniedText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: SPACING.sm,
  },
  // Referral Intel Styles
  referralIntelContainer: {
    flex: 1,
  },
  referralIntelHeader: {
    marginBottom: SPACING.xl,
  },
  referralIntelTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: COLORS.cyan,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  referralIntelSubtitle: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '600',
    marginTop: 4,
  },
  referralFilterContainer: {
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  referralModeToggle: {
    flexDirection: 'row',
    marginBottom: SPACING.md,
    backgroundColor: COLORS.bgMain,
    borderRadius: RADIUS.md,
    padding: 4,
  },
  referralModeBtn: {
    flex: 1,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
  },
  referralModeBtnActive: {
    backgroundColor: COLORS.cyan,
  },
  referralModeBtnText: {
    fontSize: 10,
    fontWeight: '900',
    color: COLORS.textSecondary,
    letterSpacing: 1,
  },
  referralModeBtnTextActive: {
    color: COLORS.bgMain,
  },
  referralDateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  referralDateButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    gap: 8,
    backgroundColor: COLORS.bgCard,
  },
  referralDateButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
    flex: 1,
  },
  referralDateArrow: {
    fontSize: 16,
    fontWeight: '900',
    color: COLORS.textSecondary,
  },
  referralSummaryGrid: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginBottom: SPACING.lg,
  },
  referralSummaryCard: {
    flex: 1,
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  referralSummaryCardPrimary: {
    backgroundColor: COLORS.cyan + '10',
    borderColor: COLORS.cyan,
  },
  referralSummaryLabel: {
    fontSize: 8,
    fontWeight: '900',
    color: COLORS.textSecondary,
    letterSpacing: 1,
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  referralSummaryLabelPrimary: {
    fontSize: 8,
    fontWeight: '900',
    color: COLORS.cyan,
    letterSpacing: 1,
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  referralSummaryValueContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  referralSummaryValue: {
    fontSize: 20,
    fontWeight: '900',
    color: COLORS.textPrimary,
  },
  referralSummaryValuePrimary: {
    fontSize: 16,
    fontWeight: '900',
    color: COLORS.cyan,
    textAlign: 'center',
  },
  referralSummaryUnit: {
    fontSize: 8,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  referralSourcesList: {
    gap: SPACING.md,
  },
  referralSourceCard: {
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  referralSourceCardExpanded: {
    borderColor: COLORS.cyan,
  },
  referralSourceHeader: {
    padding: SPACING.lg,
  },
  referralSourceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  referralSourceIcon: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.bgMain,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  referralSourceEmoji: {
    fontSize: 18,
  },
  referralSourceDetails: {
    flex: 1,
  },
  referralSourceName: {
    fontSize: 14,
    fontWeight: '900',
    color: COLORS.textPrimary,
    letterSpacing: -0.3,
  },
  referralSourceContact: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  referralSourceFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  referralSourceStats: {
    alignItems: 'center',
  },
  referralSourceCount: {
    fontSize: 24,
    fontWeight: '900',
    color: COLORS.cyan,
  },
  referralSourceLabel: {
    fontSize: 8,
    fontWeight: '900',
    color: COLORS.textSecondary,
    letterSpacing: 1,
  },
  referralSourceToggle: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  referralSourceToggleActive: {
    backgroundColor: COLORS.cyan,
    borderColor: COLORS.cyan,
  },
  referralSourceToggleText: {
    fontSize: 10,
    fontWeight: '900',
    color: COLORS.textSecondary,
  },
  referralSourceToggleTextActive: {
    color: COLORS.bgMain,
  },
  referralSourceExpanded: {
    backgroundColor: COLORS.bgMain,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  referralPatientsList: {
    padding: SPACING.lg,
  },
  referralPatientsHeader: {
    flexDirection: 'row',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    marginBottom: SPACING.sm,
  },
  referralPatientsHeaderText: {
    flex: 1,
    fontSize: 8,
    fontWeight: '900',
    color: COLORS.textSecondary,
    letterSpacing: 1,
  },
  referralPatientRow: {
    flexDirection: 'row',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border + '50',
  },
  referralPatientId: {
    flex: 1,
    fontSize: 10,
    fontWeight: '900',
    color: COLORS.cyan,
  },
  referralPatientName: {
    flex: 1,
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  referralPatientDemo: {
    flex: 1,
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  referralPatientDate: {
    flex: 1,
    fontSize: 9,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  referralEmptyState: {
    alignItems: 'center',
    paddingVertical: SPACING.xl * 2,
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
  },
  referralEmptyIcon: {
    fontSize: 48,
    marginBottom: SPACING.md,
  },
  referralEmptyTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: COLORS.textSecondary,
    letterSpacing: 1,
    marginBottom: SPACING.sm,
  },
  referralEmptySubtitle: {
    fontSize: 11,
    color: COLORS.textSecondary,
    textAlign: 'center',
    paddingHorizontal: SPACING.xl,
  },
  // Enhanced Analytics Styles
  analyticsFilterContainer: {
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  analyticsFilterLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: COLORS.cyan,
    letterSpacing: 1,
  },
  analyticsFilterButtons: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  analyticsFilterBtn: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.bgMain,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  analyticsFilterBtnText: {
    fontSize: 11,
    fontWeight: '900',
    color: COLORS.textSecondary,
  },
  enhancedKpiGrid: {
    gap: SPACING.md,
    marginBottom: SPACING.lg,
  },
  enhancedKpiCard: {
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.md,
  },
  enhancedKpiCardPrimary: {
    backgroundColor: COLORS.cyan,
    borderColor: COLORS.cyan,
  },
  enhancedKpiLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: COLORS.textSecondary,
    letterSpacing: 2,
    marginBottom: SPACING.md,
  },
  enhancedKpiValueContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  enhancedKpiValue: {
    fontSize: 32,
    fontWeight: '900',
    color: COLORS.textPrimary,
  },
  enhancedKpiValuePrimary: {
    fontSize: 32,
    fontWeight: '900',
    color: COLORS.bgMain,
  },
  enhancedKpiCurrency: {
    fontSize: 20,
    fontWeight: '900',
    color: COLORS.success,
  },
  enhancedKpiUnit: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
    opacity: 0.6,
  },
  enhancedKpiTrend: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.bgMain,
    opacity: 0.8,
  },
  enhancedKpiGrowthBadge: {
    backgroundColor: COLORS.success + '20',
    paddingVertical: 4,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.xl,
    alignSelf: 'flex-start',
  },
  enhancedKpiGrowthText: {
    fontSize: 9,
    fontWeight: '900',
    color: COLORS.success,
  },
  enhancedKpiProgressBar: {
    height: 4,
    backgroundColor: COLORS.border,
    borderRadius: 2,
    marginBottom: SPACING.sm,
  },
  enhancedKpiProgress: {
    height: '100%',
    backgroundColor: COLORS.success,
    borderRadius: 2,
  },
  enhancedKpiProgressText: {
    fontSize: 8,
    fontWeight: '800',
    color: COLORS.textSecondary,
  },
  enhancedKpiIndicators: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: SPACING.sm,
  },
  enhancedKpiIndicator: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
  enhancedKpiAlert: {
    fontSize: 9,
    fontWeight: '900',
  },
  // Modality Chart Styles
  modalityCard: {
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  modalityTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: COLORS.textSecondary,
    letterSpacing: 1,
  },
  modalityTotal: {
    fontSize: 11,
    fontWeight: '900',
    color: COLORS.textPrimary,
  },
  modalityContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xl,
  },
  modalityChartContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalityDonut: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 20,
    borderColor: COLORS.cyan,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.bgMain,
  },
  modalityDonutValue: {
    fontSize: 20,
    fontWeight: '900',
    color: COLORS.textPrimary,
  },
  modalityDonutLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.textSecondary,
    opacity: 0.5,
  },
  modalityLegend: {
    flex: 1,
    gap: SPACING.md,
  },
  modalityLegendItem: {
    marginBottom: SPACING.sm,
  },
  modalityLegendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalityLegendInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  modalityLegendColor: {
    width: 10,
    height: 10,
    borderRadius: 2,
  },
  modalityLegendLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  modalityLegendValue: {
    fontSize: 11,
    fontWeight: '900',
    color: COLORS.textPrimary,
  },
  // Daily Volume Chart Styles
  dailyVolumeCard: {
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  dailyVolumeTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: COLORS.textSecondary,
    letterSpacing: 1,
    marginBottom: SPACING.lg,
  },
  dailyVolumeChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 120,
    gap: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingBottom: SPACING.sm,
  },
  dailyVolumeBar: {
    flex: 1,
    alignItems: 'center',
    gap: SPACING.sm,
  },
  dailyVolumeBarContainer: {
    width: '100%',
    height: 100,
    justifyContent: 'flex-end',
    alignItems: 'center',
    position: 'relative',
  },
  dailyVolumeBarFill: {
    width: '100%',
    borderRadius: 4,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  dailyVolumeBarValue: {
    position: 'absolute',
    top: -18,
    fontSize: 9,
    fontWeight: '900',
  },
  dailyVolumeBarLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.textSecondary,
  },
  // Demographics Styles
  demographicsGrid: {
    gap: SPACING.lg,
  },
  demographicsCard: {
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.md,
  },
  demographicsCardTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: COLORS.textSecondary,
    letterSpacing: 1,
    marginBottom: SPACING.lg,
  },
  genderAnalysis: {
    gap: SPACING.lg,
  },
  genderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.lg,
  },
  genderIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: COLORS.bgMain,
    alignItems: 'center',
    justifyContent: 'center',
  },
  genderEmoji: {
    fontSize: 24,
  },
  genderData: {
    flex: 1,
  },
  genderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  genderLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  genderPercentage: {
    fontSize: 11,
    fontWeight: '900',
    color: COLORS.textPrimary,
  },
  genderProgressBar: {
    height: 8,
    backgroundColor: COLORS.bgMain,
    borderRadius: 4,
  },
  genderProgress: {
    height: '100%',
    borderRadius: 4,
  },
  genderInsight: {
    backgroundColor: COLORS.bgMain,
    padding: SPACING.sm,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  genderInsightText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  ageAnalysis: {
    gap: SPACING.md,
  },
  ageItem: {
    marginBottom: SPACING.sm,
  },
  ageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.sm,
  },
  ageInfo: {
    flex: 1,
  },
  ageLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: COLORS.textPrimary,
  },
  ageDesc: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  agePercentage: {
    fontSize: 11,
    fontWeight: '900',
  },
  ageProgressBar: {
    height: 6,
    backgroundColor: COLORS.bgMain,
    borderRadius: 3,
  },
  ageProgress: {
    height: '100%',
    borderRadius: 3,
  },
});