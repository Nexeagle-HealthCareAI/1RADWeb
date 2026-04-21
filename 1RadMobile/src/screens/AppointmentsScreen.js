import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  TextInput,
  Alert,
  Modal,
  useWindowDimensions,
  FlatList,
  RefreshControl,
  Animated,
  Platform,
  ActivityIndicator,
  KeyboardAvoidingView
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppointments } from '../context/AppointmentContext';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../theme/TacticalTheme';
import apiClient from '../api/apiClient';
import { 
  Calendar, 
  Clock, 
  User, 
  Plus, 
  Search, 
  Filter,
  AlertCircle,
  CheckCircle,
  XCircle,
  Edit3,
  Trash2,
  Activity,
  TrendingUp,
  Database,
  Zap,
  Shield,
  Users,
  ChevronDown,
  ChevronUp,
  Printer,
  X
} from 'lucide-react-native';
import GradientButton from '../components/GradientButton';
import EmptyState from '../components/EmptyState';
import AnimatedStatCard from '../components/AnimatedStatCard';
import BottomNavBar from '../components/BottomNavBar';
import { useAuth } from '../context/AuthContext';

// Constants matching web version
const MODALITIES = ['X-RAY', 'MRI', 'CT', 'ULTRASOUND', 'DEXA', 'ANGIOGRAPHY', 'MAMMOGRAPHY', 'PET-CT', 'NUCLEAR MEDICINE', 'FLUOROSCOPY'];
const DOCTORS = ['Dr. Brown', 'Dr. Sarah', 'Dr. Mike', 'Dr. Lisa'];
const TODAY = new Date().toISOString().split('T')[0];

const STATUS_META = {
  scheduled: { icon: '📋', label: 'Scheduled', color: '#3498db', bg: '#e8f4fd', glow: 'rgba(52,152,219,0.15)' },
  confirmed: { icon: '📍', label: 'Confirmed', color: '#2ecc71', bg: '#e9f7ef', glow: 'rgba(46,204,113,0.15)' },
  in_progress: { icon: '⚡', label: 'In Progress', color: '#f39c12', bg: '#fef9e7', glow: 'rgba(243,156,18,0.15)' },
  completed: { icon: '✅', label: 'Completed', color: '#27ae60', bg: '#d5f5e3', glow: 'rgba(39,174,96,0.15)' },
  cancelled: { icon: '⛔', label: 'Cancelled', color: '#e74c3c', bg: '#fdedec', glow: 'rgba(231,76,60,0.15)' },
};

const MODALITY_ICONS = {
  'X-RAY': '🩻', 'MRI': '🧠', 'CT': '🌀', 'ULTRASOUND': '🤰', 'DEXA': '🦴',
  'ANGIOGRAPHY': '🫀', 'MAMMOGRAPHY': '🎀', 'PET-CT': '☢', 'NUCLEAR MEDICINE': '🔬', 'FLUOROSCOPY': '📺'
};

export default function AppointmentsScreen({ navigation }) {
  const { user } = useAuth();
  const { appointments, patients, doctors, updateAppointment, deleteAppointment } = useAppointments();
  const { width } = useWindowDimensions();
  
  // State management matching web version
  const [appointmentSearchQuery, setAppointmentSearchQuery] = useState('');
  const [patientSearchQuery, setPatientSearchQuery] = useState('');
  const [filters, setFilters] = useState({ status: 'ALL', modality: 'ALL', doctor: 'ALL' });
  const [expandedRow, setExpandedRow] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  
  // Filter dropdown states
  const [showStatusFilter, setShowStatusFilter] = useState(false);
  const [showModalityFilter, setShowModalityFilter] = useState(false);
  const [showDoctorFilter, setShowDoctorFilter] = useState(false);
  
  // Animation refs
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  
  // Booking flow state
  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const [bookingStep, setBookingStep] = useState(1);
  const [newBooking, setNewBooking] = useState({ 
    patientId: '', 
    service: '', 
    modality: 'X-RAY', 
    doctor: '', 
    notes: '',
    appointmentDate: new Date(),
    appointmentTime: new Date()
  });
  
  // Date/Time picker states
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  
  // Patient management
  const [newPatient, setNewPatient] = useState({ 
    name: '', 
    mobile: '', 
    age: '', 
    gender: 'Male', 
    village: '', 
    district: '', 
    address: '', 
    referredBy: '', 
    sourceOfInfo: '' 
  });
  
  // Print modal
  const [tokenPrintData, setTokenPrintData] = useState(null);

  // Initial animation
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // Pull to refresh - now fetches from API
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      // Refresh appointments from context (which fetches from API)
      if (typeof appointments?.refresh === 'function') {
        await appointments.refresh();
      }
      // If context doesn't have refresh, we can manually fetch
      // The AppointmentContext should handle this, but as fallback:
      console.log('[APPOINTMENTS] Refreshed appointment list');
    } catch (error) {
      console.error('[APPOINTMENTS] Refresh failed:', error);
      Alert.alert('Refresh Failed', 'Unable to refresh appointments. Please try again.');
    } finally {
      setRefreshing(false);
    }
  };

  // Transform appointments to match web format
  const transformedAppointments = useMemo(() => {
    return appointments.map(apt => {
      const dt = new Date(apt.dateTime);
      return {
        id: apt.appointmentId,
        appointmentId: apt.appointmentId,
        patientName: apt.patientName,
        patientId: apt.patientId,
        mobile: patients.find(p => p.id === apt.patientId)?.phone || 'N/A',
        patientAge: 'N/A', // Update if DTO includes age
        patientGender: 'N/A', // Update if DTO includes gender
        status: apt.status.toLowerCase(), // Ensure lowercase for consistency
        modality: apt.modality || 'X-RAY',
        service: apt.service,
        doctor: apt.doctor,
        referredBy: 'N/A',
        referredContact: 'N/A',
        notes: apt.notes || '',
        date: dt.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }),
        time: dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
        priority: 'medium'
      };
    });
  }, [appointments, patients]);

  // Statistics calculation
  const stats = useMemo(() => {
    const total = transformedAppointments.length;
    const scheduled = transformedAppointments.filter(a => a.status === 'scheduled').length;
    const confirmed = transformedAppointments.filter(a => a.status === 'confirmed').length;
    const inProgress = transformedAppointments.filter(a => a.status === 'in_progress').length;
    const completed = transformedAppointments.filter(a => a.status === 'completed').length;
    const cancelled = transformedAppointments.filter(a => a.status === 'cancelled').length;
    
    return { total, scheduled, confirmed, inProgress, completed, cancelled };
  }, [transformedAppointments]);

  // Filtered appointments
  const filteredAppointments = useMemo(() => {
    return transformedAppointments.filter(app => {
      const matchesSearch = app.patientName.toLowerCase().includes(appointmentSearchQuery.toLowerCase()) || 
                           app.mobile.includes(appointmentSearchQuery) || 
                           app.id.includes(appointmentSearchQuery);
      const matchesStatus = filters.status === 'ALL' || app.status === filters.status;
      const matchesModality = filters.modality === 'ALL' || app.modality === filters.modality;
      const matchesDoctor = filters.doctor === 'ALL' || app.doctor === filters.doctor;
      return matchesSearch && matchesStatus && matchesModality && matchesDoctor;
    });
  }, [transformedAppointments, appointmentSearchQuery, filters]);

  // Action handlers
  const handleAction = async (id, action) => {
    const app = transformedAppointments.find(a => a.id === id);
    if (!app) return;

    let newStatus = '';
    if (action === 'CONFIRM') newStatus = 'confirmed';
    if (action === 'START') newStatus = 'in_progress';
    if (action === 'COMPLETE') newStatus = 'completed';
    if (action === 'CANCEL') newStatus = 'cancelled';

    try {
      await updateAppointment(app.id, { status: newStatus });
    } catch (error) {
      Alert.alert('Error', 'Failed to update appointment status');
    }
  };

  const getNextAction = (status) => {
    switch (status) {
      case 'scheduled': 
        return { action: 'CONFIRM', label: 'CONFIRM', icon: '📍', color: '#2ecc71' };
      case 'confirmed': 
        return { action: 'START', label: 'BEGIN SCAN', icon: '⚡', color: '#f39c12' };
      case 'in_progress': 
        return { action: 'COMPLETE', label: 'FINALIZE', icon: '✅', color: '#27ae60' };
      default: 
        return null;
    }
  };

  // Handle appointment booking with API integration
  const handleBookAppointment = async () => {
    try {
      setLoading(true);

      // Validate required fields
      if (!newBooking.service) {
        Alert.alert('Validation Error', 'Service/Procedure is required');
        return;
      }
      if (!newBooking.doctor) {
        Alert.alert('Validation Error', 'Doctor assignment is required');
        return;
      }

      let patientId = newBooking.patientId;

      // Create new patient if needed
      if (!patientId && newPatient.name && newPatient.mobile) {
        try {
          const patientResponse = await apiClient.post('/patients', {
            name: newPatient.name,
            mobile: newPatient.mobile,
            age: newPatient.age || '0',
            gender: newPatient.gender,
            village: newPatient.village,
            district: newPatient.district,
            address: newPatient.address,
            sourceOfInfo: newPatient.sourceOfInfo
          });
          patientId = patientResponse.data.patientId;
        } catch (error) {
          console.error('[MOBILE APPOINTMENTS] Patient creation failed:', error);
          Alert.alert('Error', 'Failed to create patient. Please try again.');
          return;
        }
      }

      if (!patientId) {
        Alert.alert('Validation Error', 'Please select or create a patient');
        return;
      }

      // Create appointment
      // Combine date and time
      const appointmentDateTime = new Date(
        newBooking.appointmentDate.getFullYear(),
        newBooking.appointmentDate.getMonth(),
        newBooking.appointmentDate.getDate(),
        newBooking.appointmentTime.getHours(),
        newBooking.appointmentTime.getMinutes()
      );

      await apiClient.post('/appointments', {
        patientId: patientId,
        service: newBooking.service,
        modality: newBooking.modality,
        dateTime: appointmentDateTime.toISOString(),
        type: 'scheduled',
        doctor: newBooking.doctor,
        referredBy: newPatient.referredBy || '',
        referredContact: '',
        notes: newBooking.notes
      });

      Alert.alert('Success', 'Appointment created successfully!');
      setIsBookingOpen(false);
      resetBooking();
      onRefresh(); // Refresh appointment list
    } catch (error) {
      console.error('[MOBILE APPOINTMENTS] Booking failed:', error);
      Alert.alert('Error', error.response?.data?.message || 'Failed to create appointment. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const resetBooking = () => {
    setBookingStep(1);
    setNewBooking({ 
      patientId: '', 
      service: '', 
      modality: 'X-RAY', 
      doctor: '', 
      notes: '',
      appointmentDate: new Date(),
      appointmentTime: new Date()
    });
    setNewPatient({ name: '', mobile: '', age: '', gender: 'Male', village: '', district: '', address: '', referredBy: '', sourceOfInfo: '' });
  };

  // Mission Intel Cards (Statistics Dashboard) - Enhanced with AnimatedStatCard
  const renderIntelCards = () => {
    const readyCount = stats.scheduled + stats.confirmed;
    const progressCount = stats.inProgress;
    
    return (
      <Animated.View 
        style={[
          styles.intelCardsContainer,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        <View style={styles.intelCardsGrid}>
          <AnimatedStatCard
            title="TOTAL MISSIONS"
            value={stats.total}
            icon={Database}
            gradient={[COLORS.cyan, '#4facfe']}
            onPress={() => {}}
            animated={true}
            suffix=" UNITS"
          />

          <AnimatedStatCard
            title="READY FOR DEPLOYMENT"
            value={readyCount}
            icon={Shield}
            gradient={['#667eea', '#764ba2']}
            onPress={() => setFilters({ ...filters, status: 'BOOKED' })}
            animated={true}
            suffix=" READY"
          />

          <AnimatedStatCard
            title="MISSION IN PROGRESS"
            value={progressCount}
            icon={Zap}
            gradient={['#f093fb', '#f5576c']}
            onPress={() => setFilters({ ...filters, status: 'IN_PROGRESS' })}
            animated={true}
            pulse={progressCount > 0}
            suffix=" ACTIVE"
          />

          <AnimatedStatCard
            title="COMPLETED OPERATIONS"
            value={stats.completed}
            icon={CheckCircle}
            gradient={['#2ecc71', '#27ae60']}
            onPress={() => setFilters({ ...filters, status: 'COMPLETED' })}
            animated={true}
            suffix=" SUCCESS"
          />
        </View>
      </Animated.View>
    );
  };

  // Filter Dropdown Component
  const FilterDropdown = ({ visible, options, selected, onSelect, onClose, title }) => (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      onRequestClose={onClose}
    >
      <TouchableOpacity 
        style={styles.filterModalOverlay} 
        activeOpacity={1} 
        onPress={onClose}
      >
        <View style={styles.filterModalContent}>
          <View style={styles.filterModalHeader}>
            <Text style={styles.filterModalTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose}>
              <X size={20} color={COLORS.textPrimary} />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.filterModalList}>
            {options.map((option) => (
              <TouchableOpacity
                key={option}
                style={[
                  styles.filterModalOption,
                  selected === option && styles.filterModalOptionSelected
                ]}
                onPress={() => {
                  onSelect(option);
                  onClose();
                }}
              >
                <Text style={[
                  styles.filterModalOptionText,
                  selected === option && styles.filterModalOptionTextSelected
                ]}>
                  {option === 'ALL' ? `All ${title}` : option}
                </Text>
                {selected === option && (
                  <CheckCircle size={16} color={COLORS.cyan} />
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </TouchableOpacity>
    </Modal>
  );

  // Filter Bar
  const renderFilterBar = () => (
    <View style={styles.filterContainer}>
      {/* Search Input */}
      <View style={styles.searchBar}>
        <Search size={16} color={COLORS.textSecondary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search patient, mobile, or ID..."
          placeholderTextColor={COLORS.textSecondary}
          value={appointmentSearchQuery}
          onChangeText={setAppointmentSearchQuery}
        />
        {appointmentSearchQuery && (
          <TouchableOpacity onPress={() => setAppointmentSearchQuery('')}>
            <X size={16} color={COLORS.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Status Filter */}
      <TouchableOpacity 
        style={styles.filterSelect}
        onPress={() => setShowStatusFilter(true)}
      >
        <Text style={styles.filterSelectText}>
          {filters.status === 'ALL' ? 'All Status' : STATUS_META[filters.status]?.label || filters.status}
        </Text>
        <ChevronDown size={14} color={COLORS.textSecondary} />
      </TouchableOpacity>

      {/* Modality Filter */}
      <TouchableOpacity 
        style={styles.filterSelect}
        onPress={() => setShowModalityFilter(true)}
      >
        <Text style={styles.filterSelectText}>
          {filters.modality === 'ALL' ? 'All Modalities' : filters.modality}
        </Text>
        <ChevronDown size={14} color={COLORS.textSecondary} />
      </TouchableOpacity>

      {/* Doctor Filter */}
      <TouchableOpacity 
        style={styles.filterSelect}
        onPress={() => setShowDoctorFilter(true)}
      >
        <Text style={styles.filterSelectText}>
          {filters.doctor === 'ALL' ? 'All Specialists' : filters.doctor}
        </Text>
        <ChevronDown size={14} color={COLORS.textSecondary} />
      </TouchableOpacity>

      {/* Clear Filters */}
      {(filters.status !== 'ALL' || filters.modality !== 'ALL' || filters.doctor !== 'ALL' || appointmentSearchQuery) && (
        <TouchableOpacity
          style={styles.clearFiltersBtn}
          onPress={() => {
            setFilters({ status: 'ALL', modality: 'ALL', doctor: 'ALL' });
            setAppointmentSearchQuery('');
          }}
        >
          <X size={12} color={COLORS.error} />
          <Text style={styles.clearFiltersText}>CLEAR FILTERS</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  // Appointment Row
  const renderAppointmentRow = ({ item: app }) => {
    const meta = STATUS_META[app.status] || STATUS_META.BOOKED;
    const next = getNextAction(app.status);
    const isExpanded = expandedRow === app.id;
    
    return (
      <View style={styles.appointmentRowContainer}>
        <TouchableOpacity
          style={[
            styles.appointmentRow,
            isExpanded && styles.appointmentRowExpanded
          ]}
          onPress={() => setExpandedRow(isExpanded ? null : app.id)}
        >
          {/* Status Accent */}
          <View style={[styles.statusAccent, { backgroundColor: meta.color }]} />

          {/* Main Content */}
          <View style={styles.appointmentContent}>
            {/* Header Row */}
            <View style={styles.appointmentHeader}>
              <View style={styles.appointmentInfo}>
                <Text style={styles.appointmentId}>{app.id}</Text>
                <Text style={styles.patientName}>{app.patientName}</Text>
                <Text style={styles.patientDetails}>
                  {app.mobile} • {app.patientAge}y {app.patientGender}
                </Text>
              </View>
              
              <View style={styles.appointmentMeta}>
                <View style={[styles.statusBadge, { backgroundColor: meta.bg }]}>
                  <Text style={styles.statusEmoji}>{meta.icon}</Text>
                  <Text style={[styles.statusText, { color: meta.color }]}>
                    {meta.label.toUpperCase()}
                  </Text>
                </View>
              </View>
            </View>

            {/* Details Row */}
            <View style={styles.appointmentDetails}>
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>REFERRED BY</Text>
                <Text style={styles.detailValue}>{app.referredBy}</Text>
              </View>
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>DOCTOR</Text>
                <Text style={styles.detailValue}>{app.doctor}</Text>
              </View>
            </View>

            {/* Action Buttons */}
            <View style={styles.actionButtons}>
              {next && (
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: next.color }]}
                  onPress={() => handleAction(app.id, next.action)}
                >
                  <Text style={styles.actionBtnIcon}>{next.icon}</Text>
                  <Text style={styles.actionBtnText}>{next.label}</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.printBtn}
                onPress={() => setTokenPrintData(app)}
              >
                <Printer size={12} color={COLORS.cyan} />
              </TouchableOpacity>

              {app.status !== 'CANCELLED' && app.status !== 'COMPLETED' && (
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => handleAction(app.id, 'CANCEL')}
                >
                  <X size={12} color={COLORS.error} />
                </TouchableOpacity>
              )}

              <View style={styles.expandIcon}>
                {isExpanded ? (
                  <ChevronUp size={12} color={COLORS.textSecondary} />
                ) : (
                  <ChevronDown size={12} color={COLORS.textSecondary} />
                )}
              </View>
            </View>
          </View>
        </TouchableOpacity>

        {/* Expanded Details */}
        {isExpanded && (
          <View style={styles.expandedDetails}>
            {/* Status Pipeline */}
            <View style={styles.statusPipeline}>
              {['scheduled', 'confirmed', 'in_progress', 'completed'].map((status, index) => {
                const statusMeta = STATUS_META[status];
                const statusIndex = ['scheduled', 'confirmed', 'in_progress', 'completed'].indexOf(app.status);
                const reached = statusIndex >= index;
                const isCurrent = status === app.status;
                
                return (
                  <View key={status} style={styles.pipelineStep}>
                    <View style={[
                      styles.pipelineIcon,
                      {
                        backgroundColor: reached ? statusMeta.color : COLORS.border,
                        width: isCurrent ? 32 : 24,
                        height: isCurrent ? 32 : 24,
                      }
                    ]}>
                      <Text style={[
                        styles.pipelineIconText,
                        { 
                          color: reached ? 'white' : COLORS.textSecondary,
                          fontSize: isCurrent ? 14 : 10
                        }
                      ]}>
                        {reached ? statusMeta.icon : (index + 1)}
                      </Text>
                    </View>
                    {index < 3 && (
                      <View style={[
                        styles.pipelineConnector,
                        { backgroundColor: statusIndex > index ? statusMeta.color : COLORS.border }
                      ]} />
                    )}
                  </View>
                );
              })}
            </View>

            {/* Additional Details */}
            <View style={styles.additionalDetails}>
              <Text style={styles.additionalDetailText}>
                Service: {app.service}
              </Text>
              {app.notes && (
                <Text style={styles.additionalDetailText}>
                  Notes: {app.notes}
                </Text>
              )}
            </View>
          </View>
        )}
      </View>
    );
  };

  // Filter Dropdown Modal
  const renderFilterDropdown = (visible, onClose, title, options, selectedValue, onSelect) => (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      onRequestClose={onClose}
    >
      <TouchableOpacity 
        style={styles.filterModalOverlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <View style={styles.filterModalContent}>
          <View style={styles.filterModalHeader}>
            <Text style={styles.filterModalTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose}>
              <X size={20} color={COLORS.textPrimary} />
            </TouchableOpacity>
          </View>
          
          <ScrollView style={styles.filterModalList}>
            {options.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.filterModalOption,
                  selectedValue === option.value && styles.filterModalOptionSelected
                ]}
                onPress={() => {
                  onSelect(option.value);
                  onClose();
                }}
              >
                <Text style={[
                  styles.filterModalOptionText,
                  selectedValue === option.value && styles.filterModalOptionTextSelected
                ]}>
                  {option.label}
                </Text>
                {selectedValue === option.value && (
                  <CheckCircle size={16} color={COLORS.cyan} />
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </TouchableOpacity>
    </Modal>
  );

  // Print Token Modal
  const renderTokenModal = () => {
    if (!tokenPrintData) return null;
    
    return (
      <Modal
        visible={!!tokenPrintData}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setTokenPrintData(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.tokenModal}>
            <View style={styles.tokenModalHeader}>
              <Text style={styles.tokenModalTitle}>THERMAL PREVIEW (80mm)</Text>
              <TouchableOpacity onPress={() => setTokenPrintData(null)}>
                <X size={18} color={COLORS.bgMain} />
              </TouchableOpacity>
            </View>
            
            <View style={styles.tokenPreviewContainer}>
              <View style={styles.tokenPreview}>
                <View style={styles.tokenHeader}>
                  <Text style={styles.tokenHubName}>1RAD HUB</Text>
                  <Text style={styles.tokenSubtitle}>CLINICAL COMMAND CENTER</Text>
                </View>
                
                <Text style={styles.tokenNumberLabel}>TOKEN NUMBER</Text>
                <View style={styles.tokenNumberContainer}>
                  <Text style={styles.tokenNumber}>
                    {tokenPrintData.id.split('T')[1] || '001'}
                  </Text>
                </View>
                
                <View style={styles.tokenPatientInfo}>
                  <Text style={styles.tokenPatientLabel}>TARGET IDENTITY:</Text>
                  <Text style={styles.tokenPatientName}>{tokenPrintData.patientName}</Text>
                  <Text style={styles.tokenPatientId}>ID: {tokenPrintData.patientId}</Text>
                </View>

                <View style={styles.tokenMissionInfo}>
                  <Text style={styles.tokenMissionTitle}>
                    MISSION: {tokenPrintData.modality || 'X-RAY'}
                  </Text>
                  <Text style={styles.tokenMissionService}>{tokenPrintData.service}</Text>
                </View>
                
                <Text style={styles.tokenDateTime}>
                  DATE: {new Date().toLocaleDateString()} | {new Date().toLocaleTimeString()}
                </Text>
                
                <View style={styles.tokenFooter}>
                  <Text style={styles.tokenFooterText}>PLEASE WAIT FOR DEPLOYMENT</Text>
                </View>
              </View>
            </View>

            <View style={styles.tokenModalActions}>
              <TouchableOpacity
                style={styles.tokenPrintBtn}
                onPress={() => {
                  Alert.alert('Print', 'Token sent to printer');
                  setTokenPrintData(null);
                }}
              >
                <Text style={styles.tokenPrintBtnText}>CONFIRM PRINT</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.tokenDiscardBtn}
                onPress={() => setTokenPrintData(null)}
              >
                <Text style={styles.tokenDiscardBtnText}>DISCARD</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  // Booking Modal (Simplified for mobile)
  const renderBookingModal = () => {
    return (
      <Modal
        visible={isBookingOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setIsBookingOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
          <View style={styles.bookingModal}>
          <View style={styles.bookingModalHeader}>
            <View>
              <Text style={styles.bookingModalTitle}>NEW MISSION</Text>
              <Text style={styles.bookingModalSubtitle}>
                Phase {bookingStep}: {bookingStep === 1 ? 'Target Identity' : 'Mission Configuration'}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setIsBookingOpen(false)}>
              <X size={24} color={COLORS.textPrimary} />
            </TouchableOpacity>
          </View>

          <View style={styles.bookingProgress}>
            {[1, 2].map(step => (
              <View
                key={step}
                style={[
                  styles.bookingProgressStep,
                  { backgroundColor: step <= bookingStep ? COLORS.cyan : COLORS.border }
                ]}
              />
            ))}
          </View>

          <ScrollView style={styles.bookingContent}>
            {bookingStep === 1 ? (
              <View style={styles.bookingStep}>
                <Text style={styles.bookingStepTitle}>SEARCH PATIENT DATABASE</Text>
                
                <View style={styles.searchBar}>
                  <Search size={16} color={COLORS.textSecondary} />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Name or mobile number..."
                    placeholderTextColor={COLORS.textSecondary}
                    value={patientSearchQuery}
                    onChangeText={setPatientSearchQuery}
                  />
                </View>

                {patientSearchQuery && (
                  <View style={styles.patientResults}>
                    {patients
                      .filter(p => 
                        p.name.toLowerCase().includes(patientSearchQuery.toLowerCase()) || 
                        p.phone.includes(patientSearchQuery)
                      )
                      .map(patient => (
                        <TouchableOpacity
                          key={patient.id}
                          style={[
                            styles.patientResult,
                            newBooking.patientId === patient.id && styles.patientResultSelected
                          ]}
                          onPress={() => setNewBooking({...newBooking, patientId: patient.id})}
                        >
                          <View style={[
                            styles.patientAvatar,
                            { backgroundColor: newBooking.patientId === patient.id ? COLORS.cyan : COLORS.bgCard }
                          ]}>
                            <Text style={[
                              styles.patientAvatarText,
                              { color: newBooking.patientId === patient.id ? COLORS.bgMain : COLORS.cyan }
                            ]}>
                              {patient.name.charAt(0)}
                            </Text>
                          </View>
                          <View style={styles.patientInfo}>
                            <Text style={styles.patientResultName}>{patient.name}</Text>
                            <Text style={styles.patientResultDetails}>{patient.phone}</Text>
                          </View>
                          {newBooking.patientId === patient.id && (
                            <CheckCircle size={16} color={COLORS.cyan} />
                          )}
                        </TouchableOpacity>
                      ))
                    }
                  </View>
                )}

                <View style={styles.newPatientForm}>
                  <Text style={styles.newPatientTitle}>ENTER NEW PATIENT DETAILS</Text>
                  
                  <View style={styles.formRow}>
                    <View style={styles.formGroup}>
                      <Text style={styles.formLabel}>FULL NAME</Text>
                      <TextInput
                        style={styles.formInput}
                        placeholder="e.g. Michael Thorne"
                        placeholderTextColor={COLORS.textSecondary}
                        value={newPatient.name}
                        onChangeText={(text) => setNewPatient({...newPatient, name: text})}
                      />
                    </View>
                    <View style={styles.formGroup}>
                      <Text style={styles.formLabel}>MOBILE</Text>
                      <TextInput
                        style={styles.formInput}
                        placeholder="987..."
                        placeholderTextColor={COLORS.textSecondary}
                        value={newPatient.mobile}
                        onChangeText={(text) => setNewPatient({...newPatient, mobile: text})}
                        keyboardType="phone-pad"
                      />
                    </View>
                  </View>

                  <View style={styles.formRow}>
                    <View style={styles.formGroup}>
                      <Text style={styles.formLabel}>AGE</Text>
                      <TextInput
                        style={styles.formInput}
                        placeholder="25"
                        placeholderTextColor={COLORS.textSecondary}
                        value={newPatient.age}
                        onChangeText={(text) => setNewPatient({...newPatient, age: text})}
                        keyboardType="numeric"
                      />
                    </View>
                    <View style={styles.formGroup}>
                      <Text style={styles.formLabel}>GENDER</Text>
                      <View style={styles.genderSelector}>
                        {['Male', 'Female', 'Other'].map(gender => (
                          <TouchableOpacity
                            key={gender}
                            style={[
                              styles.genderOption,
                              newPatient.gender === gender && styles.genderOptionSelected
                            ]}
                            onPress={() => setNewPatient({...newPatient, gender})}
                          >
                            <Text style={[
                              styles.genderOptionText,
                              newPatient.gender === gender && styles.genderOptionTextSelected
                            ]}>
                              {gender}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  </View>

                  <View style={styles.formRow}>
                    <View style={styles.formGroup}>
                      <Text style={styles.formLabel}>VILLAGE</Text>
                      <TextInput
                        style={styles.formInput}
                        placeholder="Village name"
                        placeholderTextColor={COLORS.textSecondary}
                        value={newPatient.village}
                        onChangeText={(text) => setNewPatient({...newPatient, village: text})}
                      />
                    </View>
                    <View style={styles.formGroup}>
                      <Text style={styles.formLabel}>DISTRICT</Text>
                      <TextInput
                        style={styles.formInput}
                        placeholder="District name"
                        placeholderTextColor={COLORS.textSecondary}
                        value={newPatient.district}
                        onChangeText={(text) => setNewPatient({...newPatient, district: text})}
                      />
                    </View>
                  </View>

                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>ADDRESS</Text>
                    <TextInput
                      style={[styles.formInput, styles.textArea]}
                      placeholder="Complete address..."
                      placeholderTextColor={COLORS.textSecondary}
                      value={newPatient.address}
                      onChangeText={(text) => setNewPatient({...newPatient, address: text})}
                      multiline
                      numberOfLines={2}
                    />
                  </View>

                  <View style={styles.formRow}>
                    <View style={styles.formGroup}>
                      <Text style={styles.formLabel}>REFERRED BY</Text>
                      <TextInput
                        style={styles.formInput}
                        placeholder="Referrer name (optional)"
                        placeholderTextColor={COLORS.textSecondary}
                        value={newPatient.referredBy}
                        onChangeText={(text) => setNewPatient({...newPatient, referredBy: text})}
                      />
                    </View>
                    <View style={styles.formGroup}>
                      <Text style={styles.formLabel}>SOURCE OF INFO</Text>
                      <TextInput
                        style={styles.formInput}
                        placeholder="How did you find us?"
                        placeholderTextColor={COLORS.textSecondary}
                        value={newPatient.sourceOfInfo}
                        onChangeText={(text) => setNewPatient({...newPatient, sourceOfInfo: text})}
                      />
                    </View>
                  </View>
                </View>
              </View>
            ) : (
              <View style={styles.bookingStep}>
                <Text style={styles.bookingStepTitle}>MISSION CONFIGURATION</Text>
                
                <View style={styles.modalitySection}>
                  <Text style={styles.sectionTitle}>1. Select Study Modality</Text>
                  <View style={styles.modalityGrid}>
                    {MODALITIES.slice(0, 6).map(modality => (
                      <TouchableOpacity
                        key={modality}
                        style={[
                          styles.modalityCard,
                          newBooking.modality === modality && styles.modalityCardSelected
                        ]}
                        onPress={() => setNewBooking({...newBooking, modality})}
                      >
                        <Text style={styles.modalityIcon}>
                          {MODALITY_ICONS[modality] || '📋'}
                        </Text>
                        <Text style={styles.modalityName}>{modality}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>2. SERVICE / PROCEDURE</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="e.g. Chest X-Ray with Lateral"
                    placeholderTextColor={COLORS.textSecondary}
                    value={newBooking.service}
                    onChangeText={(text) => setNewBooking({...newBooking, service: text})}
                  />
                </View>

                {/* Date and Time Selection */}
                <View style={styles.dateTimeSection}>
                  <Text style={styles.sectionTitle}>3. Schedule Appointment</Text>
                  <View style={styles.formRow}>
                    <View style={styles.formGroup}>
                      <Text style={styles.formLabel}>DATE</Text>
                      <TouchableOpacity
                        style={styles.dateTimeButton}
                        onPress={() => setShowDatePicker(true)}
                      >
                        <Calendar size={16} color={COLORS.cyan} />
                        <Text style={styles.dateTimeButtonText}>
                          {newBooking.appointmentDate.toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          })}
                        </Text>
                      </TouchableOpacity>
                    </View>
                    <View style={styles.formGroup}>
                      <Text style={styles.formLabel}>TIME</Text>
                      <TouchableOpacity
                        style={styles.dateTimeButton}
                        onPress={() => setShowTimePicker(true)}
                      >
                        <Clock size={16} color={COLORS.cyan} />
                        <Text style={styles.dateTimeButtonText}>
                          {newBooking.appointmentTime.toLocaleTimeString('en-US', {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>

                {/* Date Picker Modal */}
                {showDatePicker && (
                  <DateTimePicker
                    value={newBooking.appointmentDate}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    minimumDate={new Date()}
                    onChange={(event, selectedDate) => {
                      // Handle Android dismissal
                      if (Platform.OS === 'android') {
                        setShowDatePicker(false);
                      }
                      
                      // Update date if not dismissed
                      if (selectedDate && event.type !== 'dismissed') {
                        setNewBooking({...newBooking, appointmentDate: selectedDate});
                      }
                      
                      // Handle iOS dismissal
                      if (Platform.OS === 'ios' && event.type === 'dismissed') {
                        setShowDatePicker(false);
                      }
                    }}
                  />
                )}

                {/* Time Picker Modal */}
                {showTimePicker && (
                  <DateTimePicker
                    value={newBooking.appointmentTime}
                    mode="time"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={(event, selectedTime) => {
                      // Handle Android dismissal
                      if (Platform.OS === 'android') {
                        setShowTimePicker(false);
                      }
                      
                      // Update time if not dismissed
                      if (selectedTime && event.type !== 'dismissed') {
                        setNewBooking({...newBooking, appointmentTime: selectedTime});
                      }
                      
                      // Handle iOS dismissal
                      if (Platform.OS === 'ios' && event.type === 'dismissed') {
                        setShowTimePicker(false);
                      }
                    }}
                  />
                )}

                <View style={styles.doctorSection}>
                  <Text style={styles.sectionTitle}>4. Assign Lead Specialist</Text>
                  <View style={styles.doctorGrid}>
                    {DOCTORS.map(doctor => (
                      <TouchableOpacity
                        key={doctor}
                        style={[
                          styles.doctorCard,
                          newBooking.doctor === doctor && styles.doctorCardSelected
                        ]}
                        onPress={() => setNewBooking({...newBooking, doctor})}
                      >
                        <View style={[
                          styles.doctorAvatar,
                          { backgroundColor: newBooking.doctor === doctor ? COLORS.bgMain : COLORS.cyan + '20' }
                        ]}>
                          <Text style={[
                            styles.doctorAvatarText,
                            { color: newBooking.doctor === doctor ? COLORS.cyan : COLORS.cyan }
                          ]}>
                            {doctor.split('. ')[1]?.charAt(0) || 'D'}
                          </Text>
                        </View>
                        <Text style={[
                          styles.doctorName,
                          { color: newBooking.doctor === doctor ? COLORS.bgMain : COLORS.textPrimary }
                        ]}>
                          {doctor}
                        </Text>
                        {newBooking.doctor === doctor && (
                          <CheckCircle size={12} color={COLORS.bgMain} />
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>5. NOTES (OPTIONAL)</Text>
                  <TextInput
                    style={[styles.formInput, styles.textArea]}
                    placeholder="Clinical notes..."
                    placeholderTextColor={COLORS.textSecondary}
                    value={newBooking.notes}
                    onChangeText={(text) => setNewBooking({...newBooking, notes: text})}
                    multiline
                    numberOfLines={3}
                  />
                </View>
              </View>
            )}
          </ScrollView>

          <View style={styles.bookingFooter}>
            {bookingStep === 2 && (
              <TouchableOpacity
                style={styles.bookingBackBtn}
                onPress={() => setBookingStep(1)}
              >
                <Text style={styles.bookingBackBtnText}>← BACK</Text>
              </TouchableOpacity>
            )}
            
            <TouchableOpacity
              style={[
                styles.bookingNextBtn,
                (!newBooking.patientId && !newPatient.name && bookingStep === 1) && styles.bookingNextBtnDisabled,
                (!newBooking.service || !newBooking.doctor) && bookingStep === 2 && styles.bookingNextBtnDisabled
              ]}
              disabled={
                (bookingStep === 1 && !newBooking.patientId && !newPatient.name) ||
                (bookingStep === 2 && (!newBooking.service || !newBooking.doctor)) ||
                loading
              }
              onPress={async () => {
                if (bookingStep === 1) {
                  setBookingStep(2);
                } else {
                  await handleBookAppointment();
                }
              }}
            >
              <Text style={styles.bookingNextBtnText}>
                {loading ? 'DEPLOYING...' : (bookingStep === 1 ? 'PROCEED → MISSION CONFIG' : '🚀 DEPLOY MISSION')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <LinearGradient
        colors={['rgba(0, 242, 254, 0.1)', 'transparent']}
        style={styles.headerGradient}
      >
        <View style={styles.header}>
          <View>
            <View style={styles.headerTitleRow}>
              <Text style={styles.headerIcon}>📡</Text>
              <Text style={styles.headerTitle}>MISSION SCHEDULER</Text>
            </View>
            <Text style={styles.headerSubtitle}>
              Patient Intake & Appointment Command
              <Text style={styles.liveIndicator}> ● LIVE</Text>
            </Text>
          </View>
          
          <GradientButton
            title="NEW MISSION"
            icon={Plus}
            gradient={[COLORS.cyan, '#4facfe']}
            onPress={() => setIsBookingOpen(true)}
            size="md"
            accessibilityLabel="Create new appointment"
            accessibilityHint="Opens form to schedule a new patient appointment"
          />
        </View>
      </LinearGradient>

      <FlatList
        data={filteredAppointments}
        keyExtractor={(item) => item.id}
        renderItem={renderAppointmentRow}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.cyan}
            colors={[COLORS.cyan]}
          />
        }
        ListHeaderComponent={
          <>
            {/* Mission Intel Cards */}
            {renderIntelCards()}

            {/* Filter Bar */}
            {renderFilterBar()}

            {/* Appointments Header */}
            <View style={styles.appointmentsSection}>
              <View style={styles.appointmentsHeader}>
                <Text style={styles.appointmentsCount}>
                  {filteredAppointments.length} Mission{filteredAppointments.length !== 1 ? 's' : ''} Found
                </Text>
              </View>
            </View>
          </>
        }
        ListEmptyComponent={
          <EmptyState
            icon={Search}
            title="No Missions Match Your Filters"
            subtitle="Try adjusting your search or pipeline filters to find what you're looking for"
            actionText="CLEAR FILTERS"
            onAction={() => {
              setFilters({ status: 'ALL', modality: 'ALL', doctor: 'ALL' });
              setAppointmentSearchQuery('');
            }}
          />
        }
      />

      {/* Modals */}
      {renderTokenModal()}
      {renderBookingModal()}

      {/* Filter Dropdowns */}
      {renderFilterDropdown(
        showStatusFilter,
        () => setShowStatusFilter(false),
        'Filter by Status',
        [
          { value: 'ALL', label: 'All Status' },
          { value: 'scheduled', label: '📋 Scheduled' },
          { value: 'confirmed', label: '📍 Confirmed' },
          { value: 'in_progress', label: '⚡ In Progress' },
          { value: 'completed', label: '✅ Completed' },
          { value: 'cancelled', label: '⛔ Cancelled' },
        ],
        filters.status,
        (value) => setFilters({ ...filters, status: value })
      )}

      {renderFilterDropdown(
        showModalityFilter,
        () => setShowModalityFilter(false),
        'Filter by Modality',
        [
          { value: 'ALL', label: 'All Modalities' },
          ...MODALITIES.map(m => ({ value: m, label: `${MODALITY_ICONS[m] || '📋'} ${m}` }))
        ],
        filters.modality,
        (value) => setFilters({ ...filters, modality: value })
      )}

      {renderFilterDropdown(
        showDoctorFilter,
        () => setShowDoctorFilter(false),
        'Filter by Doctor',
        [
          { value: 'ALL', label: 'All Specialists' },
          ...DOCTORS.map(d => ({ value: d, label: d }))
        ],
        filters.doctor,
        (value) => setFilters({ ...filters, doctor: value })
      )}

      {/* Loading Overlay */}
      {loading && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.cyan} />
            <Text style={styles.loadingText}>Processing...</Text>
          </View>
        </View>
      )}

      {/* Bottom Navigation Bar */}
      <BottomNavBar userRole={user?.roles?.[0] || 'doctor'} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgMain,
  },
  headerGradient: {
    paddingTop: SPACING.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.textPrimary,
    letterSpacing: 1,
  },
  addBtn: {
    backgroundColor: COLORS.cyan,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.cyan,
  },
  searchSection: {
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  searchInput: {
    flex: 1,
    marginLeft: SPACING.sm,
    color: COLORS.textPrimary,
    fontSize: 14,
  },
  filtersContainer: {
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  filterBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    marginRight: SPACING.sm,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: 'transparent',
  },
  filterBtnActive: {
    backgroundColor: COLORS.cyan,
    borderColor: COLORS.cyan,
  },
  filterBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 1,
  },
  filterBtnTextActive: {
    color: COLORS.bgMain,
  },
  appointmentsList: {
    flex: 1,
    paddingHorizontal: SPACING.lg,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xl * 2,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginTop: SPACING.md,
  },
  emptySubtext: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: SPACING.sm,
  },
  appointmentCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.lg,
    marginBottom: SPACING.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  priorityIndicator: {
    width: 4,
  },
  appointmentContent: {
    flex: 1,
    padding: SPACING.md,
  },
  appointmentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.sm,
  },
  patientInfo: {
    flex: 1,
  },
  patientName: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  patientId: {
    fontSize: 10,
    color: COLORS.textSecondary,
    marginTop: 2,
    letterSpacing: 1,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
    marginLeft: 4,
    letterSpacing: 1,
  },
  appointmentDetails: {
    marginBottom: SPACING.md,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  detailText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginLeft: 6,
  },
  appointmentType: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.cyan,
    marginTop: 4,
  },
  appointmentNotes: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 4,
    fontStyle: 'italic',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
  },
  confirmBtn: {
    borderColor: COLORS.success + '40',
    backgroundColor: COLORS.success + '10',
  },
  editBtn: {
    borderColor: COLORS.cyan + '40',
    backgroundColor: COLORS.cyan + '10',
  },
  deleteBtn: {
    borderColor: COLORS.error + '40',
    backgroundColor: COLORS.error + '10',
  },
  actionBtnText: {
    fontSize: 9,
    fontWeight: '700',
    marginLeft: 4,
    letterSpacing: 0.5,
  },

  // Header Styles
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  headerIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: COLORS.textPrimary,
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '600',
    marginLeft: 36,
  },
  liveIndicator: {
    color: COLORS.success,
    fontWeight: '800',
  },
  newMissionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cyan,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.lg,
    ...SHADOWS.cyan,
  },
  newMissionBtnText: {
    color: COLORS.bgMain,
    fontSize: 12,
    fontWeight: '900',
    marginLeft: 8,
    letterSpacing: 1,
  },

  // List Content
  listContent: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: 100, // Space for bottom navigation
  },

  // Intel Cards Styles
  intelCardsContainer: {
    marginBottom: 32,
  },
  intelCardsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  intelCard: {
    backgroundColor: COLORS.bgCard,
    borderRadius: 20,
    padding: 24,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    position: 'relative',
    overflow: 'hidden',
    ...SHADOWS.card,
  },
  intelCardPrimary: {
    backgroundColor: COLORS.textPrimary,
  },
  intelCardLabel: {
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 2,
    color: COLORS.textSecondary,
    marginBottom: 12,
  },
  intelCardValueContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 20,
  },
  intelCardValue: {
    fontSize: 48,
    fontWeight: '950',
    lineHeight: 48,
    color: COLORS.textPrimary,
  },
  intelCardValuePrimary: {
    fontSize: 48,
    fontWeight: '950',
    lineHeight: 48,
    color: COLORS.bgCard,
  },
  intelCardUnit: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginLeft: 8,
  },
  intelCardProgress: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 8,
  },
  intelCardProgressFill: {
    height: '100%',
    backgroundColor: COLORS.cyan,
    borderRadius: 2,
  },
  intelCardTrend: {
    fontSize: 9,
    fontWeight: '900',
    color: COLORS.cyan,
    textTransform: 'uppercase',
  },
  intelCardStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
  },
  intelCardStat: {
    flex: 1,
  },
  intelCardStatLabel: {
    fontSize: 9,
    fontWeight: '900',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
  },
  intelCardStatValue: {
    fontSize: 14,
    fontWeight: '900',
    color: COLORS.textPrimary,
    marginTop: 2,
  },
  intelCardDivider: {
    width: 1,
    height: 20,
    backgroundColor: COLORS.border,
    marginHorizontal: 12,
  },

  // Filter Styles
  filterContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    flexWrap: 'wrap',
    gap: 12,
  },
  filterSelect: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minWidth: 160,
  },
  filterSelectText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
    flex: 1,
  },
  clearFiltersBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff5f5',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  clearFiltersText: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.error,
    marginLeft: 6,
  },

  // Appointments Section
  appointmentsSection: {
    flex: 1,
  },
  appointmentsHeader: {
    marginBottom: 16,
  },
  appointmentsCount: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  appointmentsTableHeader: {
    flexDirection: 'row',
    paddingHorizontal: 22,
    paddingVertical: 12,
    backgroundColor: COLORS.bgCard,
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tableHeaderText: {
    flex: 1,
    fontSize: 10,
    fontWeight: '900',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },

  // Appointment Row Styles
  appointmentRowContainer: {
    marginBottom: 10,
  },
  appointmentRow: {
    backgroundColor: COLORS.bgCard,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    position: 'relative',
    overflow: 'hidden',
  },
  appointmentRowExpanded: {
    backgroundColor: '#fafbff',
    borderColor: '#c5d5f0',
    borderBottomWidth: 0,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  statusAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    borderTopLeftRadius: 4,
    borderBottomLeftRadius: 4,
  },
  appointmentInfo: {
    flex: 1,
  },
  appointmentId: {
    fontSize: 11,
    fontWeight: '900',
    color: COLORS.textSecondary,
    fontFamily: 'monospace',
    marginBottom: 4,
  },
  patientDetails: {
    fontSize: 10,
    color: COLORS.textSecondary,
    fontWeight: '600',
    marginTop: 2,
  },
  appointmentMeta: {
    alignItems: 'flex-end',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
  },
  statusEmoji: {
    fontSize: 10,
    marginRight: 5,
  },
  detailItem: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 9,
    fontWeight: '900',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  detailValue: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginTop: 2,
  },
  actionBtnIcon: {
    fontSize: 12,
    marginRight: 5,
  },
  printBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#e8f0fe',
    borderWidth: 1,
    borderColor: '#c5d5f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#fff5f5',
    borderWidth: 1,
    borderColor: '#fecaca',
    alignItems: 'center',
    justifyContent: 'center',
  },
  expandIcon: {
    marginLeft: 4,
  },

  // Expanded Details
  expandedDetails: {
    backgroundColor: '#fafbff',
    borderRadius: 14,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderWidth: 1,
    borderColor: '#c5d5f0',
    borderTopWidth: 0,
    padding: 20,
  },
  statusPipeline: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  pipelineStep: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pipelineIcon: {
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pipelineIconText: {
    fontWeight: '900',
  },
  pipelineConnector: {
    width: 24,
    height: 2,
    borderRadius: 1,
    marginHorizontal: 6,
  },
  additionalDetails: {
    marginTop: 16,
  },
  additionalDetailText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },

  // Empty State
  emptyStateTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginTop: 16,
  },
  emptyStateSubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 8,
    textAlign: 'center',
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Loading Overlay
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  loadingContainer: {
    backgroundColor: COLORS.bgCard,
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    minWidth: 200,
    ...SHADOWS.card,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
    letterSpacing: 1,
  },

  // Filter Modal
  filterModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  filterModalContent: {
    backgroundColor: COLORS.bgCard,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '70%',
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
  },
  filterModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  filterModalTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: COLORS.textPrimary,
    letterSpacing: 0.5,
  },
  filterModalList: {
    maxHeight: 400,
  },
  filterModalOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  filterModalOptionSelected: {
    backgroundColor: COLORS.cyan + '10',
  },
  filterModalOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  filterModalOptionTextSelected: {
    color: COLORS.cyan,
    fontWeight: '700',
  },

  // Token Modal
  tokenModal: {
    width: '90%',
    maxWidth: 400,
    backgroundColor: COLORS.bgCard,
    borderRadius: 16,
    overflow: 'hidden',
  },
  tokenModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: COLORS.textPrimary,
  },
  tokenModalTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: COLORS.bgCard,
    letterSpacing: 1,
  },
  tokenPreviewContainer: {
    padding: 20,
    alignItems: 'center',
  },
  tokenPreview: {
    width: 200,
    backgroundColor: COLORS.bgCard,
    padding: 20,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
  },
  tokenHeader: {
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: COLORS.textPrimary,
    borderStyle: 'dashed',
    paddingBottom: 10,
    marginBottom: 15,
  },
  tokenHubName: {
    fontSize: 16,
    fontWeight: '900',
    color: COLORS.textPrimary,
  },
  tokenSubtitle: {
    fontSize: 9,
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
  },
  tokenNumberLabel: {
    fontSize: 10,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 5,
  },
  tokenNumberContainer: {
    borderWidth: 2,
    borderColor: COLORS.textPrimary,
    padding: 5,
    marginVertical: 5,
    alignItems: 'center',
  },
  tokenNumber: {
    fontSize: 32,
    fontWeight: '900',
    color: COLORS.textPrimary,
  },
  tokenPatientInfo: {
    marginTop: 15,
    alignItems: 'center',
  },
  tokenPatientLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.textSecondary,
  },
  tokenPatientName: {
    fontSize: 16,
    fontWeight: '900',
    color: COLORS.textPrimary,
    marginBottom: 2,
  },
  tokenPatientId: {
    fontSize: 10,
    color: COLORS.textSecondary,
  },
  tokenMissionInfo: {
    marginTop: 15,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 10,
    alignItems: 'center',
  },
  tokenMissionTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: COLORS.textPrimary,
  },
  tokenMissionService: {
    fontSize: 10,
    color: COLORS.textSecondary,
  },
  tokenDateTime: {
    marginTop: 20,
    fontSize: 9,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  tokenFooter: {
    marginTop: 30,
    borderTopWidth: 2,
    borderTopColor: COLORS.textPrimary,
    borderStyle: 'dashed',
    paddingTop: 10,
    alignItems: 'center',
  },
  tokenFooterText: {
    fontSize: 10,
    fontWeight: '900',
    color: COLORS.textPrimary,
  },
  tokenModalActions: {
    flexDirection: 'row',
    padding: 20,
    gap: 10,
  },
  tokenPrintBtn: {
    flex: 1,
    backgroundColor: COLORS.cyan,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  tokenPrintBtnText: {
    color: COLORS.bgCard,
    fontSize: 12,
    fontWeight: '900',
  },
  tokenDiscardBtn: {
    flex: 1,
    backgroundColor: COLORS.border,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  tokenDiscardBtnText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },

  // Booking Modal
  bookingModal: {
    flex: 1,
    backgroundColor: COLORS.bgMain,
  },
  bookingModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 28,
    backgroundColor: COLORS.textPrimary,
  },
  bookingModalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.bgCard,
  },
  bookingModalSubtitle: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 4,
  },
  bookingProgress: {
    flexDirection: 'row',
    paddingHorizontal: 30,
    marginTop: 20,
    gap: 4,
  },
  bookingProgressStep: {
    flex: 1,
    height: 5,
    borderRadius: 3,
  },
  bookingContent: {
    flex: 1,
    padding: 30,
  },
  bookingStep: {
    flex: 1,
  },
  bookingStepTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.cyan,
    marginBottom: 20,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },

  // Patient Results
  patientResults: {
    marginTop: 10,
    maxHeight: 160,
  },
  patientResult: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: COLORS.bgCard,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  patientResultSelected: {
    borderColor: COLORS.cyan,
    backgroundColor: COLORS.cyan + '10',
  },
  patientAvatar: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  patientAvatarText: {
    fontWeight: '900',
    fontSize: 12,
  },
  patientInfo: {
    flex: 1,
  },
  patientResultName: {
    fontWeight: '700',
    fontSize: 13,
    color: COLORS.textPrimary,
  },
  patientResultDetails: {
    fontSize: 10,
    color: COLORS.textSecondary,
    marginTop: 2,
  },

  // New Patient Form
  newPatientForm: {
    marginTop: 20,
    backgroundColor: COLORS.bgCard,
    padding: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  newPatientTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.cyan,
    marginBottom: 15,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  formRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 15,
  },
  formGroup: {
    flex: 1,
  },
  formLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.textSecondary,
    marginBottom: 8,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  formInput: {
    backgroundColor: COLORS.bgMain,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: COLORS.textPrimary,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  genderSelector: {
    flexDirection: 'row',
    gap: 8,
  },
  genderOption: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  genderOptionSelected: {
    backgroundColor: COLORS.cyan,
    borderColor: COLORS.cyan,
  },
  genderOptionText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  genderOptionTextSelected: {
    color: COLORS.bgCard,
  },

  // Modality Section
  modalitySection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: 15,
  },
  modalityGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  modalityCard: {
    width: '30%',
    aspectRatio: 1,
    backgroundColor: COLORS.bgCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  },
  modalityCardSelected: {
    backgroundColor: COLORS.cyan,
    borderColor: COLORS.cyan,
  },
  modalityIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  modalityName: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.textPrimary,
    textAlign: 'center',
  },

  // Doctor Section
  doctorSection: {
    marginBottom: 20,
  },
  
  // Date/Time Section
  dateTimeSection: {
    marginBottom: 20,
  },
  dateTimeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
  },
  dateTimeButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textPrimary,
    flex: 1,
  },
  doctorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  doctorCard: {
    width: '47%',
    backgroundColor: COLORS.bgCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    alignItems: 'center',
  },
  doctorCardSelected: {
    backgroundColor: COLORS.cyan,
    borderColor: COLORS.cyan,
  },
  doctorAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  doctorAvatarText: {
    fontSize: 16,
    fontWeight: '900',
  },
  doctorName: {
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },

  // Booking Footer
  bookingFooter: {
    flexDirection: 'row',
    padding: 30,
    gap: 15,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  bookingBackBtn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  bookingBackBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  bookingNextBtn: {
    flex: 2,
    backgroundColor: COLORS.cyan,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    ...SHADOWS.cyan,
  },
  bookingNextBtnDisabled: {
    backgroundColor: COLORS.border,
    ...SHADOWS.none,
  },
  bookingNextBtnText: {
    fontSize: 12,
    fontWeight: '900',
    color: COLORS.bgCard,
    letterSpacing: 1,
  },
});