"use client"

import { useState, useEffect } from "react"
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger,
  SelectValue
} from "@/components/ui/select"

interface DateSelectorProps {
  value: { day: number; month: number; year: number }
  onChange: (date: { day: number; month: number; year: number }) => void
  minYear?: number
  maxYear?: number
}

export function DateSelector({ 
  value, 
  onChange, 
  minYear = new Date().getFullYear() - 100,
  maxYear = new Date().getFullYear() + 10 
}: DateSelectorProps) {
  const [days, setDays] = useState<number[]>([])
  const [selectedDay, setSelectedDay] = useState<number>(value.day)
  const [selectedMonth, setSelectedMonth] = useState<number>(value.month)
  const [selectedYear, setSelectedYear] = useState<number>(value.year)

  // Generate array of years
  const years = Array.from(
    { length: maxYear - minYear + 1 },
    (_, i) => minYear + i
  ).reverse()

  // Months array
  const months = [
    { value: 1, label: "January" },
    { value: 2, label: "February" },
    { value: 3, label: "March" },
    { value: 4, label: "April" },
    { value: 5, label: "May" },
    { value: 6, label: "June" },
    { value: 7, label: "July" },
    { value: 8, label: "August" },
    { value: 9, label: "September" },
    { value: 10, label: "October" },
    { value: 11, label: "November" },
    { value: 12, label: "December" },
  ]

  // Get days in month
  useEffect(() => {
    const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate()
    const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1)
    setDays(daysArray)

    // If selected day is greater than days in month, set to last day
    if (selectedDay > daysInMonth) {
      setSelectedDay(daysInMonth)
      onChange({ day: daysInMonth, month: selectedMonth, year: selectedYear })
    }
  }, [selectedMonth, selectedYear, selectedDay, onChange])

  // Handle day change
  const handleDayChange = (value: string) => {
    const newDay = parseInt(value)
    setSelectedDay(newDay)
    onChange({ day: newDay, month: selectedMonth, year: selectedYear })
  }

  // Handle month change
  const handleMonthChange = (value: string) => {
    const newMonth = parseInt(value)
    setSelectedMonth(newMonth)
    onChange({ day: selectedDay, month: newMonth, year: selectedYear })
  }

  // Handle year change
  const handleYearChange = (value: string) => {
    const newYear = parseInt(value)
    setSelectedYear(newYear)
    onChange({ day: selectedDay, month: selectedMonth, year: newYear })
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      <div>
        <Select value={selectedMonth.toString()} onValueChange={handleMonthChange}>
          <SelectTrigger className="w-full border-gray-300">
            <SelectValue placeholder="Month" />
          </SelectTrigger>
          <SelectContent>
            {months.map((month) => (
              <SelectItem key={month.value} value={month.value.toString()}>
                {month.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Select value={selectedDay.toString()} onValueChange={handleDayChange}>
          <SelectTrigger className="w-full border-gray-300">
            <SelectValue placeholder="Day" />
          </SelectTrigger>
          <SelectContent>
            {days.map((day) => (
              <SelectItem key={day} value={day.toString()}>
                {day}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Select value={selectedYear.toString()} onValueChange={handleYearChange}>
          <SelectTrigger className="w-full border-gray-300">
            <SelectValue placeholder="Year" />
          </SelectTrigger>
          <SelectContent>
            {years.map((year) => (
              <SelectItem key={year} value={year.toString()}>
                {year}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
} 