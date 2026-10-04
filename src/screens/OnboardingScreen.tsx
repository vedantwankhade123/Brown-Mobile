import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  ScrollView,
  Image,
  Modal,
  Platform,
  Animated,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '../theme/colors';
import { typography, spacing, borderRadius } from '../theme/typography';
import {
  ShieldCheckIcon,
  CalendarIcon,
  UserIcon,
  MailIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronDownIcon,
} from '../components/Icons';
import { BrownLogo } from '../components/BrownLogo';
import { ScreenHeader } from '../components/ScreenHeader';
import { ConsentService } from '../services/storage/ConsentService';
import { revealValue } from '../utils/motion';
import { useKeyboardInset } from '../hooks/useKeyboardInset';

interface OnboardingScreenProps {
  onComplete: () => void;
}

const Easing = (Animated as any).Easing || {
  inOut: (fn: any) => fn,
  out: (fn: any) => fn,
  sin: (t: any) => t,
  cubic: (t: any) => t,
  ease: (t: any) => t,
};

export const OnboardingScreen: React.FC<OnboardingScreenProps> = ({ onComplete }) => {
  const [currentStep, setCurrentStep] = useState<number>(0);
  const keyboardInset = useKeyboardInset(0);
  const [fullName, setFullName] = useState<string>('');
  const [birthdate, setBirthdate] = useState<string>('');
  const [email, setEmail] = useState<string>('');

  const [error1, setError1] = useState<string>('');
  const [error2, setError2] = useState<string>('');
  const [error3, setError3] = useState<string>('');

  const [showDatePicker, setShowDatePicker] = useState<boolean>(false);
  const [isInputFocused, setIsInputFocused] = useState<boolean>(false);
  const [calendarView, setCalendarView] = useState<'days' | 'months' | 'years'>('days');
  const [selectedMonth, setSelectedMonth] = useState<number>(7); // August (0-indexed)
  const [selectedYear, setSelectedYear] = useState<number>(2005);
  const [selectedDay, setSelectedDay] = useState<number | null>(15);

  const [isFinishing, setIsFinishing] = useState(false);
  const finishingRef = useRef(false);

  const [showWhyModal, setShowWhyModal] = useState<boolean>(false);
  const [showTermsModal, setShowTermsModal] = useState<boolean>(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState<boolean>(false);

  useEffect(() => {
    // Pre-fill existing user info if available
    AsyncStorage.getItem('@ultron_user_profile').then((data) => {
      if (data) {
        try {
          const profile = JSON.parse(data);
          if (profile.fullName) setFullName(profile.fullName);
          if (profile.birthdate) setBirthdate(profile.birthdate);
          if (profile.email) setEmail(profile.email);
        } catch {}
      }
    });
  }, []);

  // Smooth step transition animation (fade / dissolve)
  const prevStepRef = useRef<number>(currentStep);
  const stepFadeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (prevStepRef.current === currentStep) return;
    prevStepRef.current = currentStep;

    revealValue(stepFadeAnim, 0, 1, 240, false);
  }, [currentStep, stepFadeAnim]);

  const handleStart = () => {
    setCurrentStep(1);
    clearErrors();
  };

  const clearErrors = () => {
    setError1('');
    setError2('');
    setError3('');
  };

  const handleNext = async () => {
    clearErrors();

    if (currentStep === 1) {
      if (!fullName.trim()) {
        setError1('Please enter your name.');
        return;
      }
      setCurrentStep(2);
      return;
    }

    if (currentStep === 2) {
      if (!birthdate.trim()) {
        setError2('Please select a valid date of birth.');
        return;
      }
      setCurrentStep(3);
      return;
    }

    if (currentStep === 3) {
      if (!email.trim() || !email.includes('@')) {
        setError3('Please enter a valid email address.');
        return;
      }
      await finishOnboarding();
    }
  };

  const handleBack = () => {
    clearErrors();
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    } else if (currentStep === 1) {
      setCurrentStep(0);
    }
  };

  const finishOnboarding = async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    setIsFinishing(true);
    try {
      // 1. Permanently record and archive user's legal agreement on device
      const consent = await ConsentService.recordConsent({
        fullName,
        email,
        birthdate,
        agreedToTerms: true,
        agreedToPrivacyPolicy: true,
        termsVersion: '1.0-offline',
        privacyVersion: '1.0-offline',
      });

      const profile = {
        fullName,
        birthdate,
        email,
        completedAt: Date.now(),
        consentId: consent.id,
        consentTimestamp: consent.agreedAt,
      };
      await AsyncStorage.setItem('@ultron_user_profile', JSON.stringify(profile));
      await AsyncStorage.setItem('@ultron_onboarding_completed', 'true');
      onComplete();
    } catch {
      finishingRef.current = false;
      setIsFinishing(false);
      Alert.alert('Could not finish setup', 'Your profile could not be saved. Please try again.');
    }
  };

  const handleSelectDay = (day: number) => {
    setSelectedDay(day);
    const formatted = `${String(day).padStart(2, '0')}/${String(selectedMonth + 1).padStart(2, '0')}/${selectedYear}`;
    setBirthdate(formatted);
    setShowDatePicker(false);
    setCalendarView('days');
  };

  const handleBirthdateInput = (text: string) => {
    // If user is deleting a slash, allow deletion smoothly
    if (text.length < birthdate.length && (birthdate.endsWith('/') || birthdate.endsWith('/ '))) {
      setBirthdate(text);
      setError2('');
      return;
    }

    // Extract only digits up to 8 (DDMMYYYY)
    const numbers = text.replace(/\D/g, '').slice(0, 8);
    let formatted = numbers;
    if (numbers.length > 4) {
      formatted = `${numbers.slice(0, 2)}/${numbers.slice(2, 4)}/${numbers.slice(4, 8)}`;
    } else if (numbers.length > 2) {
      formatted = `${numbers.slice(0, 2)}/${numbers.slice(2)}`;
    }

    setBirthdate(formatted);
    setError2('');

    // If complete valid date typed (DD/MM/YYYY), synchronize calendar view
    if (numbers.length === 8) {
      const d = parseInt(numbers.slice(0, 2), 10);
      const m = parseInt(numbers.slice(2, 4), 10) - 1;
      const y = parseInt(numbers.slice(4, 8), 10);
      if (d >= 1 && d <= 31 && m >= 0 && m <= 11 && y >= 1900 && y <= 2026) {
        setSelectedDay(d);
        setSelectedMonth(m);
        setSelectedYear(y);
      }
    }
  };

  const handlePrevCalendar = () => {
    if (calendarView === 'days') {
      if (selectedMonth === 0) {
        setSelectedMonth(11);
        setSelectedYear((prev) => prev - 1);
      } else {
        setSelectedMonth((prev) => prev - 1);
      }
    } else if (calendarView === 'months') {
      setSelectedYear((prev) => prev - 1);
    } else if (calendarView === 'years') {
      setSelectedYear((prev) => Math.max(1930, prev - 12));
    }
  };

  const handleNextCalendar = () => {
    if (calendarView === 'days') {
      if (selectedMonth === 11) {
        setSelectedMonth(0);
        setSelectedYear((prev) => prev + 1);
      } else {
        setSelectedMonth((prev) => prev + 1);
      }
    } else if (calendarView === 'months') {
      setSelectedYear((prev) => prev + 1);
    } else if (calendarView === 'years') {
      setSelectedYear((prev) => Math.min(2026, prev + 12));
    }
  };

  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const shortMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
  const prevMonthDaysCount = new Date(selectedYear, selectedMonth, 0).getDate();
  const rawFirstDay = new Date(selectedYear, selectedMonth, 1).getDay();
  // Monday start: Mon=0, Tue=1, Wed=2, Thu=3, Fri=4, Sat=5, Sun=6
  const firstDayOffset = rawFirstDay === 0 ? 6 : rawFirstDay - 1;

  // Leading days from previous month
  const prevMonthDays: number[] = [];
  for (let i = firstDayOffset - 1; i >= 0; i--) {
    prevMonthDays.push(prevMonthDaysCount - i);
  }

  // Current month days
  const currentMonthDays = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  // Trailing days from next month to complete 35 or 42 cells
  const totalFilled = prevMonthDays.length + currentMonthDays.length;
  const totalCells = totalFilled <= 35 ? 35 : 42;
  const nextMonthDays = Array.from({ length: totalCells - totalFilled }, (_, i) => i + 1);

  const yearList = Array.from({ length: 97 }, (_, i) => 2026 - i);

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Skip Button for Personalization (Steps 1-4) */}
      {currentStep >= 1 && currentStep <= 3 && (
        <View style={styles.onboardTopBar}>
          <TouchableOpacity
            style={styles.onboardSkipBtn}
            onPress={finishOnboarding}
            disabled={isFinishing}
            activeOpacity={0.7}
            accessibilityLabel="Skip personalization"
          >
            <Text style={styles.onboardSkipBtnText}>Skip</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scrollContent}
        style={keyboardInset > 0 ? { paddingBottom: keyboardInset } : undefined}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* Main Centered Content Block */}
        <View style={styles.onboardingCenterBlock}>
          <Animated.View
            style={[
              styles.stepTransitionWrapper,
              { opacity: stepFadeAnim },
            ]}
          >
            {/* Logo Image */}
            {currentStep === 0 ? (
              <BrownLogo size={132} style={styles.getStartedLogoImg} />
            ) : (
              <Image
                source={require('../../Assets/browny_white.png')}
                style={styles.logoImg}
                resizeMode="contain"
              />
            )}
            {currentStep === 0 && (
              <Text style={styles.onboardingBrandText}>Brown</Text>
            )}

          {/* Step 0: Welcome */}
          {currentStep === 0 && (
            <View style={styles.onboardWelcome}>
              <View style={styles.onboardBtnStack}>
                <TouchableOpacity
                  style={[styles.btnOnboardPrimary, styles.btnGetStarted]}
                  onPress={handleStart}
                  activeOpacity={0.85}
                >
                  <Text style={styles.btnOnboardPrimaryText}>Get Started</Text>
                  <ChevronRightIcon size={16} color="#000000" />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Steps 1–5: Form Shell */}
          {currentStep > 0 && (
            <View style={styles.onboardFormShell}>
              <Text style={styles.onboardStepHeading}>
                {currentStep === 1 && 'Your Name'}
                {currentStep === 2 && 'Your Date of Birth'}
                {currentStep === 3 && 'Your Email'}
              </Text>

              <View style={styles.onboardStepBody}>
                {/* Step 1: Full Name */}
                {currentStep === 1 && (
                  <View style={styles.onboardStep}>
                    <View style={styles.onboardFormGroup}>
                      <View style={styles.onboardField}>
                        <TextInput
                          style={[
                            styles.onboardInput,
                            isInputFocused && styles.onboardInputFocused,
                            Platform.OS === 'web'
                              ? ({
                                  outline: 'none',
                                  border: isInputFocused ? '2px solid #ffffff' : '1.5px solid #ffffff',
                                } as any)
                              : {},
                          ]}
                          value={fullName}
                          onChangeText={setFullName}
                          onFocus={() => setIsInputFocused(true)}
                          onBlur={() => setIsInputFocused(false)}
                          placeholder="Enter your name"
                          placeholderTextColor="#71717a"
                          autoFocus
                        />
                      </View>
                      {error1 ? <Text style={styles.onboardErrorMsg}>{error1}</Text> : null}
                    </View>
                  </View>
                )}

                {/* Step 2: Date of Birth */}
                {currentStep === 2 && (
                  <View style={styles.onboardStep}>
                    <View style={styles.onboardFormGroup}>
                      <View style={styles.onboardField}>
                        <TextInput
                          style={[
                            styles.onboardInput,
                            { paddingRight: 44 },
                            isInputFocused && styles.onboardInputFocused,
                            Platform.OS === 'web'
                              ? ({
                                  outline: 'none',
                                  border: isInputFocused ? '2px solid #ffffff' : '1.5px solid #ffffff',
                                } as any)
                              : {},
                          ]}
                          value={birthdate}
                          onChangeText={handleBirthdateInput}
                          onFocus={() => setIsInputFocused(true)}
                          onBlur={() => setIsInputFocused(false)}
                          placeholder="DD/MM/YYYY"
                          placeholderTextColor="#71717a"
                          keyboardType="numeric"
                          maxLength={10}
                        />
                        <TouchableOpacity
                          style={styles.onboardDateToggleBtn}
                          onPress={() => setShowDatePicker(!showDatePicker)}
                          activeOpacity={0.7}
                        >
                          <CalendarIcon size={18} color="#ffffff" />
                        </TouchableOpacity>
                      </View>

                      {/* Custom DOB Picker Popover */}
                      {showDatePicker && (
                        <View style={styles.customDatepickerPopover}>
                          {/* Header with Month Year v and < > */}
                          <View style={styles.datepickerHeader}>
                            <TouchableOpacity
                              style={styles.datepickerMonthYearBtn}
                              onPress={() => setCalendarView(calendarView === 'days' ? 'months' : 'days')}
                              activeOpacity={0.7}
                            >
                              <Text style={styles.datepickerMonthYearText}>
                                {months[selectedMonth]} {selectedYear}
                              </Text>
                              <ChevronDownIcon size={13} color="#a1a1aa" />
                            </TouchableOpacity>

                            <View style={styles.datepickerNavGroup}>
                              <TouchableOpacity
                                style={styles.datepickerNavBtn}
                                onPress={handlePrevCalendar}
                                activeOpacity={0.7}
                              >
                                <ChevronLeftIcon size={16} color="#d4d4d8" />
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={styles.datepickerNavBtn}
                                onPress={handleNextCalendar}
                                activeOpacity={0.7}
                              >
                                <ChevronRightIcon size={16} color="#d4d4d8" />
                              </TouchableOpacity>
                            </View>
                          </View>

                          {/* View 1: Days Grid */}
                          {calendarView === 'days' && (
                            <>
                              <View style={styles.datepickerWeekdays}>
                                {weekdays.map((w, i) => (
                                  <Text key={i} style={styles.weekdayText}>{w}</Text>
                                ))}
                              </View>

                              <View style={styles.datepickerDays}>
                                {/* Previous month trailing days */}
                                {prevMonthDays.map((d) => (
                                  <TouchableOpacity
                                    key={`prev-${d}`}
                                    style={styles.datepickerDay}
                                    onPress={() => {
                                      if (selectedMonth === 0) {
                                        setSelectedMonth(11);
                                        setSelectedYear((prev) => prev - 1);
                                      } else {
                                        setSelectedMonth((prev) => prev - 1);
                                      }
                                      handleSelectDay(d);
                                    }}
                                    activeOpacity={0.6}
                                  >
                                    <Text style={styles.dayTextMuted}>{d}</Text>
                                  </TouchableOpacity>
                                ))}

                                {/* Current month days */}
                                {currentMonthDays.map((d) => {
                                  const isSelected = selectedDay === d;
                                  return (
                                    <TouchableOpacity
                                      key={`curr-${d}`}
                                      style={styles.datepickerDay}
                                      onPress={() => handleSelectDay(d)}
                                      activeOpacity={0.7}
                                    >
                                      <View style={[styles.datepickerDayCircle, isSelected && styles.datepickerDaySelected]}>
                                        <Text style={[styles.dayText, isSelected && styles.dayTextSelected]}>
                                          {d}
                                        </Text>
                                      </View>
                                    </TouchableOpacity>
                                  );
                                })}

                                {/* Next month leading days */}
                                {nextMonthDays.map((d) => (
                                  <TouchableOpacity
                                    key={`next-${d}`}
                                    style={styles.datepickerDay}
                                    onPress={() => {
                                      if (selectedMonth === 11) {
                                        setSelectedMonth(0);
                                        setSelectedYear((prev) => prev + 1);
                                      } else {
                                        setSelectedMonth((prev) => prev + 1);
                                      }
                                      handleSelectDay(d);
                                    }}
                                    activeOpacity={0.6}
                                  >
                                    <Text style={styles.dayTextMuted}>{d}</Text>
                                  </TouchableOpacity>
                                ))}
                              </View>
                            </>
                          )}

                          {/* View 2: Single Column Vertical Months List */}
                          {calendarView === 'months' && (
                            <ScrollView
                              keyboardShouldPersistTaps="handled" style={styles.verticalListScroll}
                              contentContainerStyle={styles.verticalListContent}
                              showsVerticalScrollIndicator={false}
                            >
                              {months.map((m, idx) => {
                                const isSelected = selectedMonth === idx;
                                return (
                                  <TouchableOpacity
                                    key={m}
                                    style={[styles.verticalListItem, isSelected && styles.verticalListItemSelected]}
                                    onPress={() => {
                                      setSelectedMonth(idx);
                                      // Step directly to vertical year selector
                                      setCalendarView('years');
                                    }}
                                    activeOpacity={0.7}
                                  >
                                    <Text style={[styles.verticalListText, isSelected && styles.verticalListTextSelected]}>
                                      {m}
                                    </Text>
                                  </TouchableOpacity>
                                );
                              })}
                            </ScrollView>
                          )}

                          {/* View 3: Single Column Vertical Years List */}
                          {calendarView === 'years' && (
                            <ScrollView
                              keyboardShouldPersistTaps="handled" style={styles.verticalListScroll}
                              contentContainerStyle={styles.verticalListContent}
                              showsVerticalScrollIndicator={false}
                            >
                              {yearList.map((y) => {
                                const isSelected = selectedYear === y;
                                return (
                                  <TouchableOpacity
                                    key={y}
                                    style={[styles.verticalListItem, isSelected && styles.verticalListItemSelected]}
                                    onPress={() => {
                                      setSelectedYear(y);
                                      setCalendarView('days');
                                    }}
                                    activeOpacity={0.7}
                                  >
                                    <Text style={[styles.verticalListText, isSelected && styles.verticalListTextSelected]}>
                                      {y}
                                    </Text>
                                  </TouchableOpacity>
                                );
                              })}
                            </ScrollView>
                          )}

                          {/* Footer Actions: Clear & Today */}
                          <View style={styles.datepickerFooter}>
                            <TouchableOpacity
                              style={styles.datepickerFooterBtn}
                              onPress={() => {
                                setBirthdate('');
                                setSelectedDay(null);
                                setShowDatePicker(false);
                                setCalendarView('days');
                              }}
                            >
                              <Text style={styles.footerBtnText}>Clear</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.datepickerFooterBtn}
                              onPress={() => {
                                const now = new Date();
                                setSelectedDay(now.getDate());
                                setSelectedMonth(now.getMonth());
                                setSelectedYear(now.getFullYear());
                                handleSelectDay(now.getDate());
                              }}
                            >
                              <Text style={styles.footerBtnText}>Today</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      )}

                      {error2 ? <Text style={styles.onboardErrorMsg}>{error2}</Text> : null}
                    </View>
                  </View>
                )}

                {/* Step 3: Email */}
                {currentStep === 3 && (
                  <View style={styles.onboardStep}>
                    <View style={styles.onboardFormGroup}>
                      <View style={styles.onboardField}>
                        <TextInput
                          style={[
                            styles.onboardInput,
                            isInputFocused && styles.onboardInputFocused,
                            Platform.OS === 'web'
                              ? ({
                                  outline: 'none',
                                  border: isInputFocused ? '2px solid #ffffff' : '1.5px solid #ffffff',
                                } as any)
                              : {},
                          ]}
                          value={email}
                          onChangeText={setEmail}
                          onFocus={() => setIsInputFocused(true)}
                          onBlur={() => setIsInputFocused(false)}
                          placeholder="name@example.com"
                          placeholderTextColor="#71717a"
                          keyboardType="email-address"
                          autoCapitalize="none"
                          autoFocus
                        />
                      </View>
                      {error3 ? <Text style={styles.onboardErrorMsg}>{error3}</Text> : null}
                    </View>
                  </View>
                )}

              </View>

              {/* Action Buttons: Continue + Back */}
              <View style={styles.onboardFooterActions}>
                <TouchableOpacity
                  style={[styles.btnOnboardPrimary, styles.btnOnboardPrimaryFull]}
                  onPress={handleNext}
                  disabled={isFinishing}
                  activeOpacity={0.85}
                >
                  <Text style={styles.btnOnboardPrimaryText}>
                    {isFinishing ? 'Finishing…' : currentStep === 3 ? 'Finish' : 'Continue'}
                  </Text>
                  {isFinishing ? <ActivityIndicator size="small" color="#000000" /> : <ChevronRightIcon size={16} color="#000000" />}
                </TouchableOpacity>

                {/* Back button on EVERY step below Continue */}
                <TouchableOpacity
                  style={styles.btnOnboardBack}
                  onPress={handleBack}
                  disabled={isFinishing}
                  activeOpacity={0.7}
                >
                  <View style={styles.onboardBackIcon}><ChevronLeftIcon size={16} color="#ffffff" /></View>
                  <Text style={styles.btnOnboardBackText}>Back</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          </Animated.View>
        </View>

        {/* Legal & Privacy Footer: Pinned at the very bottom in EXACTLY 2 lines */}
        {currentStep >= 1 && currentStep <= 3 ? (
          <View style={styles.legalFooterContainer}>
            <Text style={styles.legalFooterText} numberOfLines={1}>
              By continuing, you agree to Brown's{' '}
              <Text style={styles.legalLink} onPress={() => setShowTermsModal(true)}>Terms</Text>
              {' & '}
              <Text style={styles.legalLink} onPress={() => setShowPrivacyModal(true)}>Privacy Policy</Text>.
            </Text>
            <TouchableOpacity
              style={styles.whyBottomTriggerBtn}
              onPress={() => setShowWhyModal(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.whyBottomTriggerText}>Why does an offline AI ask for this?</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.legalFooterSpacer} />
        )}
      </ScrollView>

      {/* 1. "Why is Brown asking for this?" Modal Popover — Matched to reference UI */}
      <Modal
        visible={showWhyModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowWhyModal(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            onPress={() => setShowWhyModal(false)}
            activeOpacity={1}
          />
          <View style={styles.modalCard}>
            {/* Top Heading */}
            <Text style={styles.modalMainHeading}>
              Why does Brown ask for this?
            </Text>
            <Text style={styles.modalSubheading}>
              100% on-device local profile calibration
            </Text>

            {/* Primary Capsule Action Button */}
            <TouchableOpacity
              style={styles.modalCapsuleBtn}
              onPress={() => setShowWhyModal(false)}
              activeOpacity={0.85}
            >
              <Text style={styles.modalCapsuleBtnText}>Got it, continue</Text>
              <Text style={styles.modalCapsuleArrow}>›</Text>
            </TouchableOpacity>

            {/* Divider Partition Line */}
            <View style={styles.modalDivider} />

            {/* Bottom Content & Overlapping Avatar Icon Circles */}
            <View style={styles.modalBottomContent}>
              <View style={styles.avatarBadgesRow}>
                <View style={[styles.avatarCircle, { backgroundColor: '#1e3a8a', zIndex: 4 }]}>
                  <UserIcon size={15} color="#93c5fd" />
                </View>
                <View style={[styles.avatarCircle, { backgroundColor: '#581c87', zIndex: 3, marginLeft: -8 }]}>
                  <CalendarIcon size={15} color="#d8b4fe" />
                </View>
                <View style={[styles.avatarCircle, { backgroundColor: '#78350f', zIndex: 2, marginLeft: -8 }]}>
                  <MailIcon size={15} color="#fde68a" />
                </View>
                <View style={[styles.avatarCircle, { backgroundColor: '#064e3b', zIndex: 1, marginLeft: -8 }]}>
                  <ShieldCheckIcon size={16} color="#6ee7b7" />
                </View>
              </View>

              <Text style={styles.modalBottomTitle}>
                Encrypted on-device • Zero cloud transmission
              </Text>
            </View>

            <View style={styles.modalReasonsContainer}>
              <View style={styles.whyReasonItem}>
                <View style={styles.whyReasonHeader}>
                  <UserIcon size={14} color="#93c5fd" />
                  <Text style={styles.whyReasonTitle}>Your Name</Text>
                </View>
                <Text style={styles.whyReasonDesc}>
                  Used strictly on-device so the local AI addresses you naturally without generic placeholders.
                </Text>
              </View>

              <View style={styles.whyReasonItem}>
                <View style={styles.whyReasonHeader}>
                  <CalendarIcon size={14} color="#d8b4fe" />
                  <Text style={styles.whyReasonTitle}>Date of Birth</Text>
                </View>
                <Text style={styles.whyReasonDesc}>
                  Enables your on-device SLM to calibrate appropriate conversational tone and milestones locally.
                </Text>
              </View>

              <View style={styles.whyReasonItem}>
                <View style={styles.whyReasonHeader}>
                  <MailIcon size={14} color="#fde68a" />
                  <Text style={styles.whyReasonTitle}>Email Address</Text>
                </View>
                <Text style={styles.whyReasonDesc}>
                  Acts as your local cryptographic workspace identifier for optional Wi-Fi sync. No server transmission.
                </Text>
              </View>

              <View style={styles.whyCallout}>
                <ShieldCheckIcon size={16} color="#34d399" />
                <Text style={styles.whyCalloutText}>
                  <Text style={{ fontWeight: '700', color: '#ffffff' }}>Local-first Privacy: </Text>
                  Local chats stay in app storage. Optional cloud models, speech services and desktop sync can send data to the services you choose.
                </Text>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* 2. Full-Page Terms of Service Modal */}
      <Modal
        visible={showTermsModal}
        animationType="slide"
        onRequestClose={() => setShowTermsModal(false)}
      >
        <SafeAreaView style={styles.fullPageModalContainer}>
          <ScreenHeader title="Terms Of Service" onBack={() => setShowTermsModal(false)} />

          {/* Body Content */}
          <ScrollView
            style={styles.fullPageScroll}
            contentContainerStyle={[styles.fullPageContent, { flexGrow: 1, backgroundColor: '#000000' }]}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled={true}
            keyboardShouldPersistTaps="handled"
            bounces={true}
            alwaysBounceVertical={true}
            scrollEventThrottle={16}
          >
            <Text style={styles.fullPageDocTitle}>Brown AI Platform Terms</Text>
            <Text style={styles.fullPageDocDate}>Effective Date: August 2026 • Version 1.0 (Offline Edition)</Text>

            <View style={styles.docSection}>
              <Text style={styles.docSectionHeading}>1. Acceptance of Terms</Text>
              <Text style={styles.docParagraph}>
                By installing, configuring, or running Brown Mobile, you acknowledge and agree to these Terms of Service. Brown is an autonomous on-device AI system distributed under open source and local execution principles.
              </Text>
            </View>

            <View style={styles.docSection}>
              <Text style={styles.docSectionHeading}>2. Local and Optional Cloud Models</Text>
              <Text style={styles.docParagraph}>
                Downloaded GGUF models run on your device CPU and supported GPU. Optional cloud models send the conversation context and relevant saved preferences to your configured provider. Local chat does not require a cloud subscription.
              </Text>
            </View>

            <View style={styles.docSection}>
              <Text style={styles.docSectionHeading}>{'3. Model Weights & GGUF Licenses'}</Text>
              <Text style={styles.docParagraph}>
                Supported small language models (such as Llama 3.2, Qwen 2.5, and Gemma 2) are distributed as quantized GGUF weights subject to their respective open-weights community licenses. You agree to use these models in compliance with applicable AI safety guidelines.
              </Text>
            </View>

            <View style={styles.docSection}>
              <Text style={styles.docSectionHeading}>{'4. Local Agent Operations & Autonomy'}</Text>
              <Text style={styles.docParagraph}>
                Brown functions as your autonomous companion. While Brown operates with strict safety guardrails, you maintain full supervision over all local actions, tool executions, and file operations performed on your device.
              </Text>
            </View>

            <View style={styles.docSection}>
              <Text style={styles.docSectionHeading}>5. Desktop LAN Wi-Fi Sync</Text>
              <Text style={styles.docParagraph}>
                Optional desktop synchronization uses your local network and PIN pairing. It can exchange chats, profile settings and configured connectors with the paired desktop. Network requests use the configured desktop connection; use a trusted local network.
              </Text>
            </View>

            <View style={styles.docSection}>
              <Text style={styles.docSectionHeading}>{'6. Disclaimers & Limitation of Liability'}</Text>
              <Text style={styles.docParagraph}>
                Brown is provided "as is" without warranty of any kind. Outputs produced by local language models are generated non-deterministically; you are responsible for evaluating accuracy before relying on generated content.
              </Text>
            </View>

            <TouchableOpacity
              style={styles.fullPageActionBtn}
              onPress={() => setShowTermsModal(false)}
              activeOpacity={0.85}
            >
              <Text style={styles.fullPageActionBtnText}>Close</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* 3. Full-Page Privacy Policy Modal */}
      <Modal
        visible={showPrivacyModal}
        animationType="slide"
        onRequestClose={() => setShowPrivacyModal(false)}
      >
        <SafeAreaView style={styles.fullPageModalContainer}>
          <ScreenHeader title="Privacy Policy" onBack={() => setShowPrivacyModal(false)} />

          {/* Body Content */}
          <ScrollView
            style={styles.fullPageScroll}
            contentContainerStyle={[styles.fullPageContent, { flexGrow: 1, backgroundColor: '#000000' }]}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled={true}
            keyboardShouldPersistTaps="handled"
            bounces={true}
            alwaysBounceVertical={true}
            scrollEventThrottle={16}
          >
            <Text style={styles.fullPageDocTitle}>Brown Privacy Policy</Text>
            <Text style={styles.fullPageDocDate}>Local-first data handling - Updated October 2026</Text>

            <View style={styles.docHighlightCard}>
              <ShieldCheckIcon size={24} color={colors.success} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.docHighlightTitle}>Local-first Privacy</Text>
                <Text style={styles.docHighlightSubtitle}>
                  Downloaded local models process chats on your device. Optional cloud models and connected services receive the data needed for the features you choose. Their own privacy policies also apply.
                </Text>
              </View>
            </View>

            <View style={styles.docSection}>
              <Text style={styles.docSectionHeading}>{'1. Local Models and Online Features'}</Text>
              <Text style={styles.docParagraph}>
                Downloaded models run on the device CPU and supported GPU. Model downloads and update checks contact hosting services. Cloud chat sends conversation context, instructions and relevant saved preferences to the selected provider.
              </Text>
            </View>

            <View style={styles.docSection}>
              <Text style={styles.docSectionHeading}>2. App Storage and Saved Preferences</Text>
              <Text style={styles.docParagraph}>
                Chats use local SQLite; settings and explicit saved preferences use app storage. Android app isolation and device security protect private storage; Brown does not add database encryption. You can view, edit or delete saved preferences and disable their use. Exported backups contain readable chat and preference data.
              </Text>
            </View>

            <View style={styles.docSection}>
              <Text style={styles.docSectionHeading}>3. Profile Information Scope</Text>
              <Text style={styles.docParagraph}>
                Profile information is saved locally. Optional desktop sync can exchange profile settings. You can edit your profile in Settings or delete your local account and its app data.
              </Text>
            </View>

            <View style={styles.docSection}>
              <Text style={styles.docSectionHeading}>{'4. Real-Time Speech & Audio Processing'}</Text>
              <Text style={styles.docParagraph}>
                Voice input requires microphone permission. Android speech recognition may use the installed speech provider and its online service. The optional Whisper fallback records temporary audio and sends it to your paired Brown Desktop for transcription. Cancel discards the current dictation; provider handling follows that provider's policy.
              </Text>
            </View>

            <View style={styles.docSection}>
              <Text style={styles.docSectionHeading}>5. Local Peer-to-Peer Wi-Fi Synchronization</Text>
              <Text style={styles.docParagraph}>
                Desktop sync uses your local network and PIN pairing. It can exchange chats, profiles and connector configuration with the paired desktop. Only pair with a desktop you trust, and use a trusted local network. PIN pairing is not a claim of transport encryption.
              </Text>
            </View>

            <View style={styles.docSection}>
              <Text style={styles.docSectionHeading}>{'6. Full Data Sovereignty & 1-Tap Erasure'}</Text>
              <Text style={styles.docParagraph}>
                Settings - Clear All Local Chats deletes chat history after confirmation. Saved preferences can be deleted separately in View Preferences; downloaded models have separate removal controls. These actions do not erase exported backups or data already sent to external services.
              </Text>
            </View>

            <TouchableOpacity
              style={styles.fullPageActionBtn}
              onPress={() => setShowPrivacyModal(false)}
              activeOpacity={0.85}
            >
              <Text style={styles.fullPageActionBtnText}>Close</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  onboardTopBar: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 12 : 16,
    right: 18,
    zIndex: 10,
  },
  onboardSkipBtn: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 9999,
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  onboardSkipBtnText: {
    color: '#ffffff',
    fontSize: 13.5,
    fontWeight: '500',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 20,
    minHeight: '100%',
  },
  onboardingCenterBlock: {
    width: '100%',
    maxWidth: 720,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  stepTransitionWrapper: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  getStartedLogoImg: {
    width: 132,
    height: 132,
    marginBottom: 10,
  },
  onboardingBrandText: {
    fontSize: 32,
    fontFamily: 'Outfit_500Medium',
    fontWeight: '500',
    color: '#ffffff',
    letterSpacing: -0.8,
    textAlign: 'center',
    marginBottom: 18,
  },
  logoImg: {
    width: 72,
    height: 72,
    marginBottom: 12,
  },
  onboardWelcome: {
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    textAlign: 'center',
  },
  onboardBtnStack: {
    width: '100%',
    alignItems: 'center',
  },
  onboardFormShell: {
    width: '100%',
    alignItems: 'center',
  },
  onboardStepHeading: {
    fontSize: 22,
    fontWeight: '600',
    color: '#f3f4f6',
    letterSpacing: -0.4,
    textAlign: 'center',
    marginBottom: 14,
  },
  onboardStepBody: {
    width: '100%',
    alignItems: 'center',
  },
  onboardStep: {
    width: '100%',
    alignItems: 'center',
  },
  onboardFormGroup: {
    width: '100%',
    maxWidth: 340,
  },
  onboardField: {
    position: 'relative',
    width: '100%',
    marginTop: 6,
    marginBottom: 4,
  },
  onboardInput: {
    width: '100%',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 9999,
    backgroundColor: '#000000',
    borderWidth: 1.5,
    borderColor: '#ffffff',
    color: '#ffffff',
    fontSize: 15,
  },
  onboardInputFocused: {
    borderColor: '#ffffff',
    borderWidth: 2,
  },
  onboardDateToggleBtn: {
    position: 'absolute',
    right: 11,
    top: '50%',
    marginTop: -13,
    padding: 4,
    zIndex: 2,
  },
  customDatepickerPopover: {
    width: '100%',
    backgroundColor: '#212121',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 16,
    padding: 16,
    paddingBottom: 10,
    marginTop: 8,
    marginBottom: 8,
  },
  datepickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    paddingHorizontal: 2,
  },
  datepickerMonthYearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'transparent',
    paddingVertical: 2,
  },
  datepickerMonthYearText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  datepickerNavGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  datepickerNavBtn: {
    padding: 4,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  datepickerWeekdays: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  weekdayText: {
    width: '14.28%',
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '500',
    color: '#71717a',
  },
  datepickerDays: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 2,
  },
  datepickerDay: {
    width: '14.28%',
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  datepickerDayCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  datepickerDaySelected: {
    backgroundColor: '#ffffff',
  },
  dayText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
  },
  dayTextMuted: {
    color: '#52525b',
    fontSize: 14,
    fontWeight: '400',
  },
  dayTextSelected: {
    color: '#000000',
    fontWeight: '700',
  },
  verticalListScroll: {
    maxHeight: 220,
  },
  verticalListContent: {
    paddingVertical: 4,
    gap: 6,
  },
  verticalListItem: {
    width: '100%',
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  verticalListItemSelected: {
    backgroundColor: '#ffffff',
    borderColor: '#ffffff',
  },
  verticalListText: {
    color: '#f3f4f6',
    fontSize: 14,
    fontWeight: '500',
  },
  verticalListTextSelected: {
    color: '#000000',
    fontWeight: '700',
  },
  datepickerFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  datepickerFooterBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 9999,
  },
  footerBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '500',
  },
  onboardErrorMsg: {
    fontSize: 12,
    color: '#fca5a5',
    textAlign: 'center',
    marginTop: 4,
  },
  onboardQuickLayout: {
    width: '100%',
    maxWidth: 340,
    gap: 14,
  },
  onboardQuickList: {
    gap: 10,
  },
  onboardQuickItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 13,
    paddingVertical: 11,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: '#282828',
  },
  onboardQuickItemActive: {
    backgroundColor: '#282828',
    borderColor: 'rgba(255, 255, 255, 0.22)',
  },
  onboardQuickIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#333333',
  },
  onboardQuickCopy: {
    flex: 1,
  },
  onboardQuickTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
    letterSpacing: -0.2,
  },
  onboardQuickDesc: {
    fontSize: 12.5,
    color: '#FFFFFF',
    marginTop: 2,
  },
  onboardPreviewPanel: {
    width: '100%',
    backgroundColor: '#282828',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  ollamaStatusCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  ollamaStatusIconWrapper: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusSuccessCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#10b981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  ollamaStatusInfo: {
    flex: 1,
  },
  ollamaStatusH4: {
    fontSize: 13,
    fontWeight: '600',
    color: '#f3f4f6',
    marginBottom: 2,
  },
  ollamaStatusP: {
    fontSize: 12,
    lineHeight: 16,
    color: '#FFFFFF',
  },
  ollamaReadyDetails: {
    marginTop: 6,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    gap: 10,
  },
  ollamaFeatureList: {
    gap: 8,
  },
  ollamaFeatureItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  ollamaFeatureDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10b981',
    marginTop: 5,
  },
  ollamaFeatureText: {
    fontSize: 12.5,
    color: '#d4d4d8',
    flex: 1,
    lineHeight: 17,
  },
  ollamaFeatureStrong: {
    fontWeight: '600',
    color: '#f3f4f6',
  },
  ollamaStatusFooterBadge: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  ollamaBadgePill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 9999,
    backgroundColor: '#333333',
    borderWidth: 0,
  },
  badgePillText: {
    color: '#a1a1aa',
    fontSize: 11,
    fontFamily: typography.fontFamily.mono,
  },
  onboardReadyStep: {
    alignItems: 'center',
    width: '100%',
    maxWidth: 340,
    gap: 16,
  },
  onboardReadyTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#ffffff',
    textAlign: 'center',
    letterSpacing: -0.4,
    marginBottom: 6,
  },
  onboardReadySubtitle: {
    fontSize: 13.5,
    lineHeight: 19,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  onboardReadyCard: {
    width: '100%',
    backgroundColor: '#282828',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    overflow: 'hidden',
  },
  onboardReadyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  onboardReadyCopy: {
    flex: 1,
  },
  onboardReadyRowTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
    letterSpacing: -0.2,
  },
  onboardReadyRowDesc: {
    fontSize: 12.5,
    color: '#FFFFFF',
    marginTop: 2,
  },
  onboardReadyCheck: {
    width: 28,
    height: 28,
    borderRadius: 9999,
    backgroundColor: '#22c55e',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  onboardReadyCheckMark: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 18,
    marginTop: -1,
  },
  onboardReadyDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    marginHorizontal: 14,
  },
  onboardFooterActions: {
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  btnOnboardPrimary: {
    backgroundColor: '#ffffff',
    borderRadius: 9999,
    paddingVertical: 12,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  btnGetStarted: {
    minWidth: 180,
    paddingHorizontal: 24,
  },
  onboardBackIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnOnboardPrimaryFull: {
    width: '100%',
  },
  btnOnboardPrimaryText: {
    color: '#000000',
    fontSize: 17,
    fontWeight: '600',
  },
  btnOnboardBack: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    paddingVertical: 8,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  btnOnboardBackText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '500',
  },
  legalFooterContainer: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 16,
    paddingBottom: Platform.OS === 'ios' ? 12 : 6,
  },
  legalFooterSpacer: {
    height: 10,
  },
  legalFooterText: {
    color: '#FFFFFF',
    fontSize: 11,
    textAlign: 'center',
    fontWeight: '400',
  },
  legalLink: {
    color: '#0072A5',
    fontWeight: '500',
    textDecorationLine: 'underline',
    textDecorationColor: '#0072A5',
  },
  whyBottomTriggerBtn: {
    marginTop: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  whyBottomTriggerText: {
    color: '#0072A5',
    fontSize: 11,
    fontWeight: '500',
    textDecorationLine: 'underline',
    textDecorationColor: '#0072A5',
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.88)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalBackdrop: {
    position: 'absolute',
    inset: 0,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#161618',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 26,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 22,
    alignItems: 'center',
  },
  modalMainHeading: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f4f4f5',
    textAlign: 'center',
    lineHeight: 24,
    letterSpacing: -0.3,
  },
  modalSubheading: {
    fontSize: 12.5,
    color: '#a1a1aa',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 14,
    fontWeight: '400',
  },
  modalCapsuleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 9999,
    paddingVertical: 10,
    paddingHorizontal: 24,
    gap: 6,
  },
  modalCapsuleBtnText: {
    color: '#000000',
    fontSize: 13.5,
    fontWeight: '600',
  },
  modalCapsuleArrow: {
    color: '#000000',
    fontSize: 15,
    fontWeight: '700',
    marginTop: -1,
  },
  modalDivider: {
    width: '100%',
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    marginVertical: 14,
  },
  modalBottomContent: {
    alignItems: 'center',
    marginBottom: 10,
  },
  avatarBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  avatarCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: '#161618',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBottomTitle: {
    color: '#a1a1aa',
    fontSize: 11.5,
    fontWeight: '500',
    textAlign: 'center',
  },
  modalReasonsContainer: {
    width: '100%',
  },
  whyReasonItem: {
    marginBottom: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.025)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.04)',
  },
  whyReasonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  whyReasonTitle: {
    color: '#f3f4f6',
    fontSize: 12,
    fontWeight: '600',
  },
  whyReasonDesc: {
    color: '#a1a1aa',
    fontSize: 11,
    lineHeight: 15,
  },
  whyCallout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#064e3b',
    borderWidth: 1,
    borderColor: '#10b981',
    borderRadius: 8,
    padding: 10,
    marginTop: 4,
  },
  whyCalloutText: {
    color: '#ecfdf5',
    fontSize: 11,
    lineHeight: 15,
    flex: 1,
  },
  fullPageModalContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  fullPageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 0,
    borderBottomColor: colors.border,
    backgroundColor: 'transparent',
  },
  fullPageBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  fullPageBackText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  fullPageHeaderTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1,
  },
  fullPageScroll: {
    flex: 1,
    width: '100%',
    backgroundColor: '#000000',
    ...(Platform.OS === 'web'
      ? ({
          overflowY: 'auto',
          touchAction: 'pan-y',
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        } as any)
      : {}),
  },
  fullPageContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    maxWidth: 740,
    width: '100%',
    alignSelf: 'center',
    backgroundColor: '#000000',
  },
  fullPageDocTitle: {
    color: '#f3f4f6',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 6,
  },
  fullPageDocDate: {
    color: '#a1a1aa',
    fontSize: 12,
    marginBottom: spacing.md,
  },
  docHighlightCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#18181b',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  docHighlightTitle: {
    color: '#f3f4f6',
    fontSize: 14,
    fontWeight: '700',
  },
  docHighlightSubtitle: {
    color: '#a1a1aa',
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  docSection: {
    marginBottom: spacing.lg,
  },
  docSectionHeading: {
    color: '#f3f4f6',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 6,
  },
  docParagraph: {
    color: '#a1a1aa',
    fontSize: 13,
    lineHeight: 19,
  },
  fullPageActionBtn: {
    backgroundColor: '#ffffff',
    borderRadius: 9999,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xl,
    marginBottom: spacing.xxl,
  },
  fullPageActionBtnText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '700',
  },
});
