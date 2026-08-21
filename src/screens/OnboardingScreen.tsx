import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  ScrollView,
  Image,
  Modal,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '../theme/colors';
import { typography, spacing, borderRadius } from '../theme/typography';
import {
  ShieldCheckIcon,
  ShieldIcon,
  CalendarIcon,
  UserIcon,
  MailIcon,
  CloudIcon,
  LaptopIcon,
  BackArrowIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronDownIcon,
} from '../components/Icons';
import { ScreenHeader } from '../components/ScreenHeader';
import { ConsentService } from '../services/storage/ConsentService';

interface OnboardingScreenProps {
  onComplete: () => void;
}

export const OnboardingScreen: React.FC<OnboardingScreenProps> = ({ onComplete }) => {
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [fullName, setFullName] = useState<string>('');
  const [birthdate, setBirthdate] = useState<string>('');
  const [email, setEmail] = useState<string>('');

  const [error1, setError1] = useState<string>('');
  const [error2, setError2] = useState<string>('');
  const [error3, setError3] = useState<string>('');

  const [showDatePicker, setShowDatePicker] = useState<boolean>(false);
  const [calendarView, setCalendarView] = useState<'days' | 'months' | 'years'>('days');
  const [selectedMonth, setSelectedMonth] = useState<number>(7); // August (0-indexed)
  const [selectedYear, setSelectedYear] = useState<number>(2005);
  const [selectedDay, setSelectedDay] = useState<number | null>(15);

  const [activeQuickItem, setActiveQuickItem] = useState<number>(0);
  const [engineReady, setEngineReady] = useState<boolean>(false);

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
      setCurrentStep(4);
      runEngineCheck();
      return;
    }

    if (currentStep === 4) {
      setCurrentStep(5);
      return;
    }

    if (currentStep === 5) {
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

  const runEngineCheck = () => {
    setEngineReady(false);
    setTimeout(() => {
      setEngineReady(true);
    }, 700);
  };

  const finishOnboarding = async () => {
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
      {currentStep >= 1 && currentStep < 5 && (
        <View style={styles.onboardTopBar}>
          <TouchableOpacity
            style={styles.onboardSkipBtn}
            onPress={finishOnboarding}
            activeOpacity={0.7}
            accessibilityLabel="Skip personalization"
          >
            <Text style={styles.onboardSkipBtnText}>Skip</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* Main Centered Content Block */}
        <View style={styles.onboardingCenterBlock}>
          {/* Logo Image */}
          <Image
            source={require('../../Assets/ultron-logo.png')}
            style={styles.logoImg}
            resizeMode="contain"
          />

          {/* Step 0: Welcome */}
          {currentStep === 0 && (
            <View style={styles.onboardWelcome}>
              <Text style={styles.onboardingTitle}>Welcome to Ultron AI</Text>
              <Text style={styles.onboardingTagline}>The Autonomous AI Agent for Windows</Text>
              <View style={styles.onboardBtnStack}>
                <TouchableOpacity
                  style={styles.btnOnboardPrimary}
                  onPress={handleStart}
                  activeOpacity={0.85}
                >
                  <Text style={styles.btnOnboardPrimaryText}>Get Started</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Steps 1–5: Form Shell */}
          {currentStep > 0 && (
            <View style={styles.onboardFormShell}>
              {currentStep < 4 && (
                <Text style={styles.onboardStepHeading}>
                  {currentStep === 1 && 'Your profile'}
                  {currentStep === 2 && 'Date of birth'}
                  {currentStep === 3 && 'Email'}
                </Text>
              )}

              <View style={styles.onboardStepBody}>
                {/* Step 1: Full Name */}
                {currentStep === 1 && (
                  <View style={styles.onboardStep}>
                    <View style={styles.onboardFormGroup}>
                      <View style={styles.onboardField}>
                        <Text style={styles.fieldFloatingLabel}>Name</Text>
                        <TextInput
                          style={styles.onboardInput}
                          value={fullName}
                          onChangeText={setFullName}
                          placeholder=""
                          placeholderTextColor={colors.textMuted}
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
                        <Text style={styles.fieldFloatingLabel}>Date of birth</Text>
                        <TextInput
                          style={[styles.onboardInput, { paddingRight: 44 }]}
                          value={birthdate}
                          onChangeText={handleBirthdateInput}
                          placeholder="DD/MM/YYYY"
                          placeholderTextColor="#52525b"
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
                              style={styles.verticalListScroll}
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
                              style={styles.verticalListScroll}
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
                        <Text style={styles.fieldFloatingLabel}>Email</Text>
                        <TextInput
                          style={styles.onboardInput}
                          value={email}
                          onChangeText={setEmail}
                          placeholder=""
                          placeholderTextColor={colors.textMuted}
                          keyboardType="email-address"
                          autoCapitalize="none"
                          autoFocus
                        />
                      </View>
                      {error3 ? <Text style={styles.onboardErrorMsg}>{error3}</Text> : null}
                    </View>
                  </View>
                )}

                {/* Step 4: Quick Start / Engine Setup */}
                {currentStep === 4 && (
                  <View style={styles.onboardQuickLayout}>
                    <View style={styles.onboardQuickList}>
                      <TouchableOpacity
                        style={[styles.onboardQuickItem, activeQuickItem === 0 && styles.onboardQuickItemActive]}
                        onPress={() => setActiveQuickItem(0)}
                        activeOpacity={0.8}
                      >
                        <View style={styles.onboardQuickIcon}>
                          <LaptopIcon size={18} color="#ffffff" />
                        </View>
                        <View style={styles.onboardQuickCopy}>
                          <Text style={styles.onboardQuickTitle}>Local models</Text>
                          <Text style={styles.onboardQuickDesc}>Download GGUFs from Hugging Face</Text>
                        </View>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.onboardQuickItem, activeQuickItem === 1 && styles.onboardQuickItemActive]}
                        onPress={() => setActiveQuickItem(1)}
                        activeOpacity={0.8}
                      >
                        <View style={styles.onboardQuickIcon}>
                          <CloudIcon size={18} color="#ffffff" />
                        </View>
                        <View style={styles.onboardQuickCopy}>
                          <Text style={styles.onboardQuickTitle}>Cloud models</Text>
                          <Text style={styles.onboardQuickDesc}>Connect Gemini in Settings later</Text>
                        </View>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.onboardQuickItem, activeQuickItem === 2 && styles.onboardQuickItemActive]}
                        onPress={() => setActiveQuickItem(2)}
                        activeOpacity={0.8}
                      >
                        <View style={styles.onboardQuickIcon}>
                          <ShieldIcon size={18} color="#ffffff" />
                        </View>
                        <View style={styles.onboardQuickCopy}>
                          <Text style={styles.onboardQuickTitle}>Private by default</Text>
                          <Text style={styles.onboardQuickDesc}>Your data stays on this device</Text>
                        </View>
                      </TouchableOpacity>
                    </View>

                    <View style={styles.onboardPreviewPanel}>
                      <View style={styles.ollamaStatusCard}>
                        <View style={styles.ollamaStatusIconWrapper}>
                          {!engineReady ? (
                            <ActivityIndicator size="small" color="#ffffff" />
                          ) : (
                            <View style={styles.statusSuccessCheck}>
                              <Text style={styles.checkText}>✓</Text>
                            </View>
                          )}
                        </View>
                        <View style={styles.ollamaStatusInfo}>
                          <Text style={styles.ollamaStatusH4}>
                            {!engineReady ? 'Checking on-device engine...' : 'On-device engine is ready'}
                          </Text>
                          <Text style={styles.ollamaStatusP}>
                            {!engineReady
                              ? 'Verifying your local AI engine before finishing setup.'
                              : 'Your local AI engine is running and ready for inference.'}
                          </Text>
                        </View>
                      </View>

                      {engineReady && (
                        <View style={styles.ollamaReadyDetails}>
                          <View style={styles.ollamaFeatureList}>
                            <View style={styles.ollamaFeatureItem}>
                              <View style={styles.ollamaFeatureDot} />
                              <Text style={styles.ollamaFeatureText}>
                                <Text style={styles.ollamaFeatureStrong}>100% Offline & Private. </Text>
                                Zero data sent to cloud servers
                              </Text>
                            </View>
                            <View style={styles.ollamaFeatureItem}>
                              <View style={styles.ollamaFeatureDot} />
                              <Text style={styles.ollamaFeatureText}>
                                <Text style={styles.ollamaFeatureStrong}>High Performance. </Text>
                                Local GPU/CPU neural inference
                              </Text>
                            </View>
                            <View style={styles.ollamaFeatureItem}>
                              <View style={styles.ollamaFeatureDot} />
                              <Text style={styles.ollamaFeatureText}>
                                <Text style={styles.ollamaFeatureStrong}>Model Support. </Text>
                                Llama 3, DeepSeek, Qwen & Custom GGUFs
                              </Text>
                            </View>
                          </View>

                          <View style={styles.ollamaStatusFooterBadge}>
                            <View style={styles.ollamaBadgePill}>
                              <Text style={styles.badgePillText}>Localhost:11434</Text>
                            </View>
                            <View style={styles.ollamaBadgePill}>
                              <Text style={styles.badgePillText}>Ultron Core Active</Text>
                            </View>
                          </View>
                        </View>
                      )}
                    </View>
                  </View>
                )}

                {/* Step 5: Ready */}
                {currentStep === 5 && (
                  <View style={styles.onboardReadyStep}>
                    <Text style={styles.onboardReadyTitle}>Ultron is ready</Text>
                    <Text style={styles.onboardReadySubtitle}>
                      Your profile is set and your local AI engine is online.
                    </Text>

                    <View style={styles.onboardReadyCard}>
                      <View style={styles.onboardReadyRow}>
                        <View style={styles.onboardQuickIcon}>
                          <UserIcon size={18} color="#ffffff" />
                        </View>
                        <View style={styles.onboardReadyCopy}>
                          <Text style={styles.onboardReadyRowTitle}>Profile created</Text>
                          <Text style={styles.onboardReadyRowDesc}>Saved on this device</Text>
                        </View>
                        <View style={styles.onboardReadyCheck}>
                          <Text style={styles.onboardReadyCheckMark}>✓</Text>
                        </View>
                      </View>

                      <View style={styles.onboardReadyDivider} />

                      <View style={styles.onboardReadyRow}>
                        <View style={styles.onboardQuickIcon}>
                          <LaptopIcon size={18} color="#ffffff" />
                        </View>
                        <View style={styles.onboardReadyCopy}>
                          <Text style={styles.onboardReadyRowTitle}>Engine ready</Text>
                          <Text style={styles.onboardReadyRowDesc}>On-device inference is available</Text>
                        </View>
                        <View style={styles.onboardReadyCheck}>
                          <Text style={styles.onboardReadyCheckMark}>✓</Text>
                        </View>
                      </View>

                      <View style={styles.onboardReadyDivider} />

                      <View style={styles.onboardReadyRow}>
                        <View style={styles.onboardQuickIcon}>
                          <ShieldCheckIcon size={18} color="#ffffff" />
                        </View>
                        <View style={styles.onboardReadyCopy}>
                          <Text style={styles.onboardReadyRowTitle}>Agent online</Text>
                          <Text style={styles.onboardReadyRowDesc}>Private by default</Text>
                        </View>
                        <View style={styles.onboardReadyCheck}>
                          <Text style={styles.onboardReadyCheckMark}>✓</Text>
                        </View>
                      </View>
                    </View>
                  </View>
                )}
              </View>

              {/* Action Buttons: Continue + Back */}
              <View style={styles.onboardFooterActions}>
                {currentStep < 5 ? (
                  <TouchableOpacity
                    style={styles.btnOnboardPrimary}
                    onPress={handleNext}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.btnOnboardPrimaryText}>Continue</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.btnOnboardPrimary}
                    onPress={finishOnboarding}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.btnOnboardPrimaryText}>Finish</Text>
                  </TouchableOpacity>
                )}

                {/* Back button on EVERY step below Continue */}
                <TouchableOpacity
                  style={styles.btnOnboardBack}
                  onPress={handleBack}
                  activeOpacity={0.7}
                >
                  <View style={styles.btnOnboardBackIcon}>
                    <BackArrowIcon size={16} color="#ffffff" />
                  </View>
                  <Text style={styles.btnOnboardBackText}>Back</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* Legal & Privacy Footer: Pinned at the very bottom in EXACTLY 2 lines */}
        {currentStep >= 1 && currentStep <= 3 ? (
          <View style={styles.legalFooterContainer}>
            <Text style={styles.legalFooterText} numberOfLines={1}>
              By continuing, you agree to Ultron's{' '}
              <Text style={styles.legalLink} onPress={() => setShowTermsModal(true)}>Terms of Service</Text>
              {' and '}
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

      {/* 1. "Why is Ultron asking for this?" Modal Popover — Matched to reference UI */}
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
              Why does Ultron ask for this?
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
                  <Text style={{ fontWeight: '700', color: '#ffffff' }}>Zero-Telemetry Guarantee: </Text>
                  All data is encrypted in local SQLite and never leaves this phone.
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
            contentContainerStyle={styles.fullPageContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.fullPageDocTitle}>Ultron AI Platform Terms</Text>
            <Text style={styles.fullPageDocDate}>Effective Date: August 2026 • Version 1.0 (Offline Edition)</Text>

            <View style={styles.docSection}>
              <Text style={styles.docSectionHeading}>1. Acceptance of Terms</Text>
              <Text style={styles.docParagraph}>
                By installing, configuring, or running Ultron Mobile, you acknowledge and agree to these Terms of Service. Ultron is an autonomous on-device AI system distributed under open source and local execution principles.
              </Text>
            </View>

            <View style={styles.docSection}>
              <Text style={styles.docSectionHeading}>2. 100% On-Device Neural Execution</Text>
              <Text style={styles.docParagraph}>
                All neural inferences, embeddings, token generation, and agent reasoning occur directly on your local hardware utilizing Apple Neural Engine (ANE) or Android NPU/GPU acceleration. Ultron does not rely on mandatory cloud APIs or remote subscription servers.
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
                Ultron functions as your autonomous companion. While Ultron operates with strict safety guardrails, you maintain full supervision over all local actions, tool executions, and file operations performed on your device.
              </Text>
            </View>

            <View style={styles.docSection}>
              <Text style={styles.docSectionHeading}>5. Desktop LAN Wi-Fi Sync</Text>
              <Text style={styles.docParagraph}>
                Optional synchronization with your Desktop Ultron node occurs strictly over your private local area network (LAN) utilizing end-to-end PIN encryption. No data is transmitted across public relay servers.
              </Text>
            </View>

            <View style={styles.docSection}>
              <Text style={styles.docSectionHeading}>{'6. Disclaimers & Limitation of Liability'}</Text>
              <Text style={styles.docParagraph}>
                Ultron is provided "as is" without warranty of any kind. Outputs produced by local language models are generated non-deterministically; you are responsible for evaluating accuracy before relying on generated content.
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
            contentContainerStyle={styles.fullPageContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.fullPageDocTitle}>Ultron Offline Privacy Policy</Text>
            <Text style={styles.fullPageDocDate}>Zero-Telemetry Commitment • Updated August 2026</Text>

            <View style={styles.docHighlightCard}>
              <ShieldCheckIcon size={24} color={colors.success} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.docHighlightTitle}>Zero-Telemetry Guarantee</Text>
                <Text style={styles.docHighlightSubtitle}>
                  Ultron is built from the ground up as a 100% privacy-first, offline-capable assistant. Your prompts, chats, files, and voice recordings never touch external cloud servers.
                </Text>
              </View>
            </View>

            <View style={styles.docSection}>
              <Text style={styles.docSectionHeading}>{'1. 100% Offline & Private Local Execution'}</Text>
              <Text style={styles.docParagraph}>
                Ultron runs local neural weights directly on your device CPU/NPU hardware. There are zero tracking pixels, zero telemetry beacons, and zero diagnostic logging transmitted to any centralized servers.
              </Text>
            </View>

            <View style={styles.docSection}>
              <Text style={styles.docSectionHeading}>2. Encrypted Local Storage</Text>
              <Text style={styles.docParagraph}>
                All conversation histories, session indices, system instructions, and vector embeddings are stored inside an encrypted local SQLite database on your device protected by OS-level sandbox security and hardware keystores.
              </Text>
            </View>

            <View style={styles.docSection}>
              <Text style={styles.docSectionHeading}>3. Profile Information Scope</Text>
              <Text style={styles.docParagraph}>
                Your profile information (Full Name, Date of Birth, Email Address) is stored strictly in local application storage. It is used exclusively to calibrate natural on-device SLM tone and generate local cryptographic workspace identities. It is never sold, shared, or synced externally.
              </Text>
            </View>

            <View style={styles.docSection}>
              <Text style={styles.docSectionHeading}>{'4. Real-Time Speech & Audio Processing'}</Text>
              <Text style={styles.docParagraph}>
                Microphone audio recorded during speech-to-text (STT) interaction is streamed directly into volatile in-memory neural processing buffers (Whisper STT). Audio waveforms are immediately discarded after text transcription and never stored on disk.
              </Text>
            </View>

            <View style={styles.docSection}>
              <Text style={styles.docSectionHeading}>5. Local Peer-to-Peer Wi-Fi Synchronization</Text>
              <Text style={styles.docParagraph}>
                When syncing chats between your mobile device and Desktop Ultron, communication occurs strictly across your local Wi-Fi subnet with end-to-end cryptographic PIN verification. No external relay or cloud servers ever mediate the transfer.
              </Text>
            </View>

            <View style={styles.docSection}>
              <Text style={styles.docSectionHeading}>{'6. Full Data Sovereignty & 1-Tap Erasure'}</Text>
              <Text style={styles.docParagraph}>
                You retain complete, absolute ownership of all generated content. At any time, you can trigger an irreversible 1-tap wipe via Settings → Clear All Data to permanently delete all local databases, cached models, and preferences.
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
    backgroundColor: '#141414',
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
    borderWidth: 1,
    borderColor: '#ffffff',
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
  logoImg: {
    width: 64,
    height: 64,
    marginBottom: 14,
    tintColor: '#FFFFFF',
  },
  onboardWelcome: {
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    textAlign: 'center',
  },
  onboardingTitle: {
    fontSize: 28,
    fontWeight: '600',
    lineHeight: 32,
    color: '#f3f4f6',
    letterSpacing: -0.8,
    textAlign: 'center',
    marginBottom: 2,
  },
  onboardingTagline: {
    fontSize: 15,
    lineHeight: 20,
    color: '#9ca3af',
    fontWeight: '400',
    textAlign: 'center',
    marginBottom: 18,
  },
  onboardBtnStack: {
    width: '100%',
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
    maxWidth: 420,
  },
  onboardField: {
    position: 'relative',
    width: '100%',
    marginTop: 10,
    marginBottom: 8,
  },
  fieldFloatingLabel: {
    position: 'absolute',
    top: -9,
    left: 12,
    backgroundColor: '#141414',
    paddingHorizontal: 6,
    fontSize: 12,
    fontWeight: '500',
    color: '#a1a1aa',
    zIndex: 1,
  },
  onboardInput: {
    width: '100%',
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    color: '#f3f4f6',
    fontSize: 15,
  },
  onboardDateToggleBtn: {
    position: 'absolute',
    right: 12,
    top: '50%',
    marginTop: -10,
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
    maxWidth: 420,
    gap: 14,
  },
  onboardQuickList: {
    gap: 10,
  },
  onboardQuickItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: '#282828',
  },
  onboardQuickItemActive: {
    backgroundColor: '#282828',
    borderColor: 'rgba(255, 255, 255, 0.22)',
  },
  onboardQuickIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
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
    color: '#a1a1aa',
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
    color: '#a1a1aa',
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
    maxWidth: 420,
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
    color: '#9ca3af',
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
    color: '#a1a1aa',
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
    maxWidth: 420,
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
  },
  btnOnboardPrimary: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 9999,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnOnboardPrimaryText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '600',
  },
  btnOnboardBack: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  btnOnboardBackIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnOnboardBackText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '400',
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
    color: '#9ca3af',
    fontSize: 11.5,
    textAlign: 'center',
    fontWeight: '400',
  },
  legalLink: {
    color: '#d4d4d8',
    textDecorationLine: 'underline',
  },
  whyBottomTriggerBtn: {
    marginTop: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  whyBottomTriggerText: {
    color: '#d4d4d8',
    fontSize: 11.5,
    fontWeight: '400',
    textDecorationLine: 'underline',
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
    backgroundColor: '#141414',
  },
  fullPageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
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
  },
  fullPageContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    maxWidth: 740,
    width: '100%',
    alignSelf: 'center',
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
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderHighlight,
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
