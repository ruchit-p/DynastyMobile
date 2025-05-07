"use client"

import * as React from "react"
import { addDays, format, isSameDay } from "date-fns"
import { ChevronLeft, ChevronRight, X } from "lucide-react"
import { DateRange } from "react-day-picker"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"

// Time options for the select component (12-hour format)
const timeOptions = Array.from({ length: 24 * 4 }, (_, i) => {
  const hour = Math.floor(i / 4)
  const minute = (i % 4) * 15
  const period = hour >= 12 ? "PM" : "AM"
  const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour
  return {
    value: `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`,
    label: `${hour12}:${minute.toString().padStart(2, "0")} ${period}`,
  }
})

const timezoneOptions = [
  { value: "America/New_York", label: "Eastern Time (ET)" },
  { value: "America/Chicago", label: "Central Time (CT)" },
  { value: "America/Denver", label: "Mountain Time (MT)" },
  { value: "America/Los_Angeles", label: "Pacific Time (PT)" },
  { value: "America/Halifax", label: "Atlantic Standard Time (AST)" },
  { value: "Pacific/Honolulu", label: "Hawaii-Aleutian Standard Time (HST)" },
  { value: "Europe/London", label: "Greenwich Mean Time (GMT)" },
  { value: "Europe/Paris", label: "Central European Time (CET)" },
  { value: "Asia/Kolkata", label: "India Standard Time (IST)" },
  { value: "Asia/Shanghai", label: "China Standard Time (CST)" },
  { value: "Asia/Tokyo", label: "Japan Standard Time (JST)" },
  { value: "America/Sao_Paulo", label: "Brazil Standard Time (BRT)" },
  { value: "Australia/Sydney", label: "Australian Eastern Time (AET)" },
]

interface DateTimeRange {
  date: Date
  startTime: string
  endTime: string
}

// Define the date format for a date object that the create-event page uses
export interface SimpleDate {
  day: number
  month: number
  year: number
}

export interface DateRangePickerProps {
  startDate: SimpleDate
  endDate: SimpleDate | null
  startTime: string
  endTime: string
  timezone: string
  isMultiDay: boolean
  onStartDateChange: (date: SimpleDate) => void
  onEndDateChange: (date: SimpleDate) => void
  onStartTimeChange: (time: string) => void
  onEndTimeChange: (time: string) => void
  onTimezoneChange: (timezone: string) => void
  onMultiDayChange: (isMultiDay: boolean) => void
  onDaySpecificTimesChange?: (daySpecificTimes: Record<string, { startTime: string, endTime: string }>) => void
  initialDaySpecificTimes?: Record<string, { startTime: string, endTime: string }>
}

export function DateRangePicker({
  startDate,
  endDate,
  startTime,
  endTime,
  timezone,
  isMultiDay,
  onStartDateChange,
  onEndDateChange,
  onStartTimeChange,
  onEndTimeChange,
  onTimezoneChange,
  onMultiDayChange,
  onDaySpecificTimesChange,
  initialDaySpecificTimes,
}: DateRangePickerProps) {
  // Format date display function to handle undefined dates
  const formatDateDisplay = (date: Date | undefined) => {
    if (!date || date.getFullYear() < 1900) {
      return "Not selected";
    }
    return format(date, "MMM d, yyyy");
  };

  // Helper to check if a SimpleDate is empty
  const isEmptyDate = (date: SimpleDate | null): boolean => {
    return !date || date.year <= 0 || date.month <= 0 || date.day <= 0;
  };

  // Convert SimpleDate to JavaScript Date objects, but only if they exist and are valid
  const fromDate = isEmptyDate(startDate) 
    ? undefined 
    : new Date(startDate.year, startDate.month - 1, startDate.day);
  
  const toDate = endDate && !isEmptyDate(endDate)
    ? new Date(endDate.year, endDate.month - 1, endDate.day) 
    : undefined;

  // Initialize dateRange with the provided dates or undefined
  const [dateRange, setDateRange] = React.useState<DateRange>({
    from: fromDate,
    to: toDate,
  });

  // Automatically set user's timezone
  React.useEffect(() => {
    // Only set the timezone if it's not already set (empty or default)
    if (!timezone) {
      const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      onTimezoneChange(userTimeZone);
    }
  }, [timezone, onTimezoneChange]);

  // Current displayed month in the calendar - default to current month if no selection
  const [currentMonth, setCurrentMonth] = React.useState<Date>(fromDate || new Date());
  
  // Date-time ranges for each day
  const [dateTimeRanges, setDateTimeRanges] = React.useState<DateTimeRange[]>([]);
  
  // Whether to use the same time for all days
  const [useSameTime, setUseSameTime] = React.useState(
    !initialDaySpecificTimes || Object.keys(initialDaySpecificTimes).length === 0
  );
  
  // Current day index for individual day time configuration
  const [currentDayIndex, setCurrentDayIndex] = React.useState(0);
  
  // Whether we're in the time setup mode
  const [isTimeSetupMode, setIsTimeSetupMode] = React.useState(false);
  
  // Local state to track currently displayed time (sync with the current day's time)
  const [displayStartTime, setDisplayStartTime] = React.useState(startTime);
  const [displayEndTime, setDisplayEndTime] = React.useState(endTime);

  // Get formatted date range for preview section
  const getFormattedDateRange = () => {
    if (!dateRange.from) {
      return "No dates selected";
    }
    
    const fromStr = format(dateRange.from, "MMM dd, yyyy");
    
    if (!dateRange.to) {
      return fromStr;
    }
    
    const toStr = format(dateRange.to, "MMM dd, yyyy");
    return `${fromStr} - ${toStr}`;
  };

  // Clear dates function
  const clearDates = () => {
    // Set the flag to indicate we're updating
    isUpdatingDateRange.current = true;
    
    setDateRange({ from: undefined, to: undefined });
    
    // Update parent component
    onStartDateChange({
      day: 0,
      month: 0,
      year: 0,
    });
    
    onEndDateChange({
      day: 0,
      month: 0,
      year: 0,
    });
    
    // Reset isMultiDay if needed
    if (isMultiDay) {
      onMultiDayChange(false);
    }
    
    // Reset time setup mode
    setIsTimeSetupMode(false);
    
    // Reset the update flag after all changes are applied
    setTimeout(() => {
      isUpdatingDateRange.current = false;
    }, 0);
  };

  // Handle month navigation
  const handlePrevMonth = () => {
    const prevMonth = new Date(currentMonth);
    prevMonth.setMonth(prevMonth.getMonth() - 1);
    setCurrentMonth(prevMonth);
  };

  const handleNextMonth = () => {
    const nextMonth = new Date(currentMonth);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    setCurrentMonth(nextMonth);
  };

  // Handle time change for a specific day
  const handleTimeChange = (index: number, type: "startTime" | "endTime", value: string) => {
    const newRanges = [...dateTimeRanges];
    newRanges[index][type] = value;
    setDateTimeRanges(newRanges);

    // Only update the parent component if using same time for all days
    // This prevents the global time from affecting all days when in day-specific mode
    if (useSameTime) {
      if (type === "startTime") {
        onStartTimeChange(value);
      } else {
        onEndTimeChange(value);
      }
    } else if (onDaySpecificTimesChange) {
      // For day-specific times, immediately update the parent
      const updatedTimes: Record<string, { startTime: string, endTime: string }> = {};
      newRanges.forEach(range => {
        const dateStr = format(range.date, 'yyyy-MM-dd');
        updatedTimes[dateStr] = {
          startTime: range.startTime,
          endTime: range.endTime
        };
      });
      
      console.log("[DateRangePicker] Immediate day-specific time update:", updatedTimes);
      onDaySpecificTimesChange(updatedTimes);
    }
  };

  // Handle navigation between days
  const handleNextDay = () => {
    if (currentDayIndex < dateTimeRanges.length - 1) {
      const nextIndex = currentDayIndex + 1;
      setCurrentDayIndex(nextIndex);
      
      // Update the displayed time to match the current day's time
      if (!useSameTime && dateTimeRanges[nextIndex]) {
        // We're just updating the UI display, not affecting the actual data
        // This doesn't call the parent onStartTimeChange because we don't want
        // to update the global time when just navigating between days
        setDisplayStartTime(dateTimeRanges[nextIndex].startTime);
        setDisplayEndTime(dateTimeRanges[nextIndex].endTime);
      }
    }
  };

  const handlePreviousDay = () => {
    if (currentDayIndex > 0) {
      const prevIndex = currentDayIndex - 1;
      setCurrentDayIndex(prevIndex);
      
      // Update the displayed time to match the current day's time
      if (!useSameTime && dateTimeRanges[prevIndex]) {
        // We're just updating the UI display, not affecting the actual data
        setDisplayStartTime(dateTimeRanges[prevIndex].startTime);
        setDisplayEndTime(dateTimeRanges[prevIndex].endTime);
      }
    }
  };

  // Add reference for tracking initial render and preventing infinite updates
  const isUpdatingDateRange = React.useRef(false);
  
  // Simplified date range select handler
  const handleDateRangeSelect = (range: DateRange | undefined) => {
    // Prevent infinite update loops by checking if we're already updating
    if (isUpdatingDateRange.current) {
      isUpdatingDateRange.current = false;
      return;
    }

    if (!range) {
      clearDates();
      return;
    }

    // Set the flag to indicate we're updating
    isUpdatingDateRange.current = true;
    setDateRange(range);
    
    // Update parent component with start date
    if (range.from) {
      onStartDateChange({
        day: range.from.getDate(),
        month: range.from.getMonth() + 1,
        year: range.from.getFullYear(),
      });
    } else {
      // Clear start date if it's deselected
      onStartDateChange({
        day: 0,
        month: 0,
        year: 0,
      });
      
      // If start date is cleared, also clear end date to prevent inconsistent state
      onEndDateChange({
        day: 0,
        month: 0,
        year: 0,
      });
      
      // Reset isMultiDay when clearing dates
      if (isMultiDay) {
        onMultiDayChange(false);
      }
      
      // Reset the update flag and exit early
      setTimeout(() => {
        isUpdatingDateRange.current = false;
      }, 0);
      return;
    }
    
    // Update parent component with end date
    if (range.to) {
      onEndDateChange({
        day: range.to.getDate(),
        month: range.to.getMonth() + 1,
        year: range.to.getFullYear(),
      });
      
      // Only update multiDay if it's different from current state
      const newIsMultiDay = !isSameDay(range.from, range.to);
      if (newIsMultiDay !== isMultiDay) {
        onMultiDayChange(newIsMultiDay);
      }
    } else {
      // Clear end date if it's deselected
      onEndDateChange({
        day: 0,
        month: 0,
        year: 0,
      });
      
      // Reset isMultiDay when clearing end date
      if (isMultiDay) {
        onMultiDayChange(false);
      }
    }
    
    // Reset the update flag after all changes are applied
    setTimeout(() => {
      isUpdatingDateRange.current = false;
    }, 0);
  };

  // Add this ref to track changes to dateTimeRanges
  const previousDateRangeRef = React.useRef<DateRange | null>(null);

  // Update the useEffect
  React.useEffect(() => {
    // Skip if we're in the middle of a dateRange update
    if (isUpdatingDateRange.current) {
      return;
    }
    
    // Check if the dateRange has actually changed to prevent circular updates
    const dateRangeChanged = 
      !previousDateRangeRef.current || 
      !dateRange.from || 
      !previousDateRangeRef.current.from ||
      dateRange.from.getTime() !== previousDateRangeRef.current.from.getTime() ||
      (dateRange.to?.getTime() !== previousDateRangeRef.current.to?.getTime());
    
    // Update the ref with current dateRange
    previousDateRangeRef.current = { ...dateRange };
    
    // Only proceed if dateRange has changed or other deps have changed
    if (!dateRangeChanged && dateTimeRanges.length > 0) {
      return;
    }
    
    if (dateRange.from && dateRange.from.getFullYear() >= 1900) {
      const endDate = dateRange.to || dateRange.from;
      
      // Check if we're just changing the date range (adding/removing days)
      // and preserve existing time settings for days that already exist
      if (dateTimeRanges.length > 0) {
        const existingDateMap = new Map(
          dateTimeRanges.map(item => [format(item.date, 'yyyy-MM-dd'), item])
        );
        
        // Generate an array of dates from start to end
        const dates: DateTimeRange[] = [];
        let currentDate = new Date(dateRange.from);
        
        while (currentDate <= endDate) {
          const dateStr = format(currentDate, 'yyyy-MM-dd');
          const existingData = existingDateMap.get(dateStr);
          
          dates.push({
            date: new Date(currentDate),
            startTime: existingData?.startTime || startTime,
            endTime: existingData?.endTime || endTime,
          });
          currentDate = addDays(currentDate, 1);
        }
        
        setDateTimeRanges(dates);
      } else {
        // No existing date time ranges, create new ones
        const dates: DateTimeRange[] = [];
        let currentDate = new Date(dateRange.from);
        
        while (currentDate <= endDate) {
          dates.push({
            date: new Date(currentDate),
            startTime,
            endTime,
          });
          currentDate = addDays(currentDate, 1);
        }
        
        setDateTimeRanges(dates);
      }
      
      setCurrentDayIndex(0);
      setIsTimeSetupMode(true);
      
      // Update isMultiDay based on date range - only call if different
      const newIsMultiDay = dateRange.to !== undefined && !isSameDay(dateRange.from, dateRange.to);
      if (newIsMultiDay !== isMultiDay) {
        onMultiDayChange(newIsMultiDay);
      }
    } else {
      setDateTimeRanges([]);
      setIsTimeSetupMode(false);
    }
  }, [dateRange, startTime, endTime, isMultiDay, onMultiDayChange, dateTimeRanges]);

  // Format time for display
  const formatTimeDisplay = (time: string) => {
    const [hours, minutes] = time.split(":");
    const hour = Number.parseInt(hours);
    const period = hour >= 12 ? "PM" : "AM";
    const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${hour12}:${minutes} ${period}`;
  };

  // Update display times when prop times change
  React.useEffect(() => {
    setDisplayStartTime(startTime);
    setDisplayEndTime(endTime);
  }, [startTime, endTime]);

  // Sync display times with the current day when the current day index changes
  React.useEffect(() => {
    if (dateTimeRanges.length > 0 && dateTimeRanges[currentDayIndex]) {
      setDisplayStartTime(dateTimeRanges[currentDayIndex].startTime);
      setDisplayEndTime(dateTimeRanges[currentDayIndex].endTime);
    }
  }, [currentDayIndex, dateTimeRanges]);

  // Update day-specific times when dateTimeRanges or useSameTime changes
  React.useEffect(() => {
    // Skip if we're not using day-specific times or we don't have a callback
    if (useSameTime || !onDaySpecificTimesChange || dateTimeRanges.length === 0 || !isTimeSetupMode) {
      return;
    }
    
    // Skip this effect during initialization
    if (isSettingInitialTimes.current) {
      return;
    }
    
    // Use a ref to prevent this effect from firing too frequently
    const timeoutId = setTimeout(() => {
      // Generate a day-specific times object from the dateTimeRanges
      const daySpecificTimes: Record<string, { startTime: string, endTime: string }> = {};
      
      dateTimeRanges.forEach(range => {
        const dateStr = format(range.date, 'yyyy-MM-dd');
        daySpecificTimes[dateStr] = {
          startTime: range.startTime,
          endTime: range.endTime,
        };
      });
      
      onDaySpecificTimesChange(daySpecificTimes);
    }, 100);
    
    return () => clearTimeout(timeoutId);
  }, [dateTimeRanges, useSameTime, onDaySpecificTimesChange, isTimeSetupMode]);

  // Track if we're currently setting initial times to prevent update loops
  const isSettingInitialTimes = React.useRef(false);

  // Set up initialDaySpecificTimes on initial load
  React.useEffect(() => {
    if (initialDaySpecificTimes && Object.keys(initialDaySpecificTimes).length > 0 && dateRange.from && dateRange.to) {
      console.log("[DateRangePicker] Setting initial day-specific times:", initialDaySpecificTimes);
      
      // Mark that we're setting initial times to prevent update loops
      isSettingInitialTimes.current = true;
      
      // If we have day-specific times, make sure useSameTime is false
      setUseSameTime(false);
      
      // Create initial date ranges from the day-specific times
      const dates: DateTimeRange[] = [];
      let currentDate = new Date(dateRange.from);
      
      while (currentDate <= dateRange.to) {
        const dateStr = format(currentDate, 'yyyy-MM-dd');
        const timeSettings = initialDaySpecificTimes[dateStr];
        
        dates.push({
          date: new Date(currentDate),
          startTime: timeSettings?.startTime || startTime,
          endTime: timeSettings?.endTime || endTime,
        });
        
        currentDate = addDays(currentDate, 1);
      }
      
      // Only set if we have dates
      if (dates.length > 0) {
        setDateTimeRanges(dates);
      }
      
      // Make sure the parent gets the updated day-specific times
      if (onDaySpecificTimesChange) {
        onDaySpecificTimesChange(initialDaySpecificTimes);
      }

      // After updating state, clear the flag
      setTimeout(() => {
        isSettingInitialTimes.current = false;
      }, 0);
    }
  }, [initialDaySpecificTimes, dateRange.from, dateRange.to, endTime, onDaySpecificTimesChange, startTime]);

  // Memoize handlers to prevent unnecessary rerenders
  const handleTimezoneChange = React.useCallback((value: string) => {
    if (value !== timezone) {
      onTimezoneChange(value);
    }
  }, [timezone, onTimezoneChange]);

  return (
    <div className="w-full mx-auto p-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left side - Date selection */}
        <Card className="h-fit shadow-none">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle>Date Selection</CardTitle>
              <CardDescription>Select your date range</CardDescription>
            </div>
            {(dateRange.from || dateRange.to) && (
              <Button 
                type="button"
                variant="ghost" 
                size="sm" 
                onClick={clearDates}
                className="h-8 px-2 text-muted-foreground"
              >
                <X className="h-4 w-4 mr-1" />
                Clear
              </Button>
            )}
          </CardHeader>
          <CardContent className="pb-4">
            <div className="flex flex-col space-y-4 ">
              <div className="flex justify-center items-center">
                <Button variant="outline" size="icon" onClick={handlePrevMonth} type="button">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="font-medium px-6">{format(currentMonth, "MMMM yyyy")}</div>
                <Button variant="outline" size="icon" onClick={handleNextMonth} type="button">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex justify-center items-center">
              <Calendar
                mode="range"
                selected={dateRange}
                onSelect={handleDateRangeSelect}
                month={currentMonth}
                onMonthChange={setCurrentMonth}
                numberOfMonths={1}
                className="rounded-md border"
                showOutsideDays
                fixedWeeks
                classNames={{ 
                  day_today: "bg-transparent",
                  day_selected: "!bg-[#0A5C36] !text-primary-foreground hover:bg-[#0A5C36]/90",
                  day_range_middle: "!bg-[#0A5C36]/20 text-foreground hover:bg-[#0A5C36]/30",
                  day_range_end: "!bg-[#0A5C36] !text-primary-foreground hover:bg-[#0A5C36]/90",
                  day_range_start: "!bg-[#0A5C36] !text-primary-foreground hover:bg-[#0A5C36]/90",
                  nav: "hidden", // Hide the nav arrows inside the calendar
                  caption: "hidden", // Hide the month caption inside the calendar
                }}
              />
              </div>
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 rounded-sm bg-[#0A5C36]"></div>
                  <span className="text-sm">Selected Range</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 rounded-sm bg-[#0A5C36]/20"></div>
                  <span className="text-sm">Days in Range</span>
                </div>
              </div>

              <div className="flex flex-col space-y-2 pt-2">
                <div className="flex items-center justify-between">
                  <Label>Start Date</Label>
                  {dateRange.from ? (
                    <Badge variant="outline" className="font-medium">
                      {formatDateDisplay(dateRange.from)}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground text-sm">Not selected</span>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <Label>End Date</Label>
                  {dateRange.to ? (
                    <Badge variant="outline" className="font-medium">
                      {formatDateDisplay(dateRange.to)}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground text-sm">Not selected</span>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Right side - Time selection */}
        <Card className="h-fit shadow-none">
          <CardHeader>
            <CardTitle>Time Settings</CardTitle>
            <CardDescription>
              {isTimeSetupMode
                ? (useSameTime
                  ? "Set the same time for all selected days"
                  : (dateTimeRanges[currentDayIndex] && dateTimeRanges[currentDayIndex].date)
                    ? `Configure time for ${format(dateTimeRanges[currentDayIndex].date, "EEEE, MMMM d, yyyy")}`
                    : "Configure time for selected day")
                : "Select dates to begin time setup"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Timezone Selection */}
            <div className="space-y-2">
              <Label htmlFor="timezone">Timezone</Label>
              <Select 
                value={timezone} 
                onValueChange={handleTimezoneChange}
              >
                <SelectTrigger id="timezone" className="border-gray-300">
                  <SelectValue placeholder="Select timezone" />
                </SelectTrigger>
                <SelectContent>
                  {timezoneOptions.map((tz) => (
                    <SelectItem key={tz.value} value={tz.value}>
                      {tz.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isTimeSetupMode && (
              <>
                <div className="flex items-center justify-between space-x-2">
                  <div>
                    <Label htmlFor="same-time" className="text-sm font-medium cursor-pointer">
                      Use same time for all days
                    </Label>
                    <p className="text-xs text-gray-500 mt-1">
                      When enabled, all days will use the same start and end time
                    </p>
                  </div>
                  <Switch
                    id="same-time" 
                    checked={useSameTime}
                    onCheckedChange={setUseSameTime}
                    className="data-[state=checked]:bg-[#0A5C36] data-[state=checked]:border-[#0A5C36]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="start-time">Start Time</Label>
                    <Select
                      value={!useSameTime ? displayStartTime : startTime}
                      onValueChange={(value) => {
                        if (useSameTime) {
                          onStartTimeChange(value);
                          setDisplayStartTime(value);
                          setDateTimeRanges((prev) =>
                            prev.map((range) => ({
                              ...range,
                              startTime: value,
                            }))
                          );
                        } else {
                          setDisplayStartTime(value);
                          handleTimeChange(currentDayIndex, "startTime", value);
                        }
                      }}
                    >
                      <SelectTrigger id="start-time" className="border-gray-300">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <ScrollArea className="h-60">
                          {timeOptions.map((time) => (
                            <SelectItem key={`start-${time.value}`} value={time.value}>
                              {time.label}
                            </SelectItem>
                          ))}
                        </ScrollArea>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="end-time">End Time</Label>
                    <Select
                      value={!useSameTime ? displayEndTime : endTime}
                      onValueChange={(value) => {
                        if (useSameTime) {
                          onEndTimeChange(value);
                          setDisplayEndTime(value);
                          setDateTimeRanges((prev) =>
                            prev.map((range) => ({
                              ...range,
                              endTime: value,
                            }))
                          );
                        } else {
                          setDisplayEndTime(value);
                          handleTimeChange(currentDayIndex, "endTime", value);
                        }
                      }}
                    >
                      <SelectTrigger id="end-time" className="border-gray-300">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <ScrollArea className="h-60">
                          {timeOptions.map((time) => (
                            <SelectItem key={`end-${time.value}`} value={time.value}>
                              {time.label}
                            </SelectItem>
                          ))}
                        </ScrollArea>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {!useSameTime && dateTimeRanges.length > 1 && (
                  <div className="flex justify-between mt-4">
                    <Button 
                      type="button"
                      variant="outline" 
                      onClick={handlePreviousDay} 
                      disabled={currentDayIndex === 0}
                      className="px-2 sm:px-4"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      <span className="hidden sm:inline ml-2">Previous</span>
                      <span className="inline sm:hidden">Prev</span>
                    </Button>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-muted-foreground">
                        <span className="hidden sm:inline">Day {currentDayIndex + 1} of {dateTimeRanges.length}</span>
                        <span className="inline sm:hidden">{currentDayIndex + 1}/{dateTimeRanges.length}</span>
                      </span>
                    </div>
                    <Button 
                      type="button"
                      variant="outline" 
                      onClick={handleNextDay} 
                      disabled={currentDayIndex === dateTimeRanges.length - 1}
                      className="px-2 sm:px-4"
                    >
                      <span className="hidden sm:inline mr-2">Next</span>
                      <span className="inline sm:hidden">Next</span>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Preview Card when dates are selected */}
      {dateTimeRanges.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Selection Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div>
                <span className="font-medium">Date Range:</span>{" "}
                {getFormattedDateRange()}
              </div>
              <div>
                <span className="font-medium">Timezone:</span> {timezone}
              </div>
              {useSameTime ? (
                <div>
                  <span className="font-medium">Time:</span>{" "}
                  {formatTimeDisplay(startTime)} - {formatTimeDisplay(endTime)}
                </div>
              ) : (
                <>
                  <Separator className="my-2" />
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                    {dateTimeRanges.map((range, index) => (
                      <div key={index} className="flex justify-between text-sm p-2 border rounded-md">
                        <div className="font-medium">{format(range.date, "EEE, MMM d")}</div>
                        <div>
                          {formatTimeDisplay(range.startTime)} - {formatTimeDisplay(range.endTime)}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
} 