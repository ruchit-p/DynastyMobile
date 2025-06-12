'use client';

import React, { useState, useEffect } from 'react';
import { Check, Server, Cloud, Database, Info, Zap, Shield, DollarSign } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { StorageProvider } from '@/utils/storageUtils';
import StorageUtils, { StorageConfig } from '@/utils/storageUtils';

interface StorageProviderInfo {
  provider: StorageProvider;
  name: string;
  description: string;
  icon: React.ReactNode;
  features: string[];
  pros: string[];
  cons: string[];
  maxFileSize: string;
  pricing: string;
  performance: 'excellent' | 'good' | 'fair';
  security: 'excellent' | 'good' | 'fair';
  recommended?: boolean;
}

interface StorageProviderSelectorProps {
  selectedProvider?: StorageProvider;
  onProviderChange: (provider: StorageProvider) => void;
  fileType?: string;
  fileSize?: number;
  showRecommendation?: boolean;
  className?: string;
}

const PROVIDER_INFO: StorageProviderInfo[] = [
  {
    provider: 'b2',
    name: 'Backblaze B2',
    description: 'Cost-effective cloud storage with excellent performance and S3 compatibility',
    icon: <Database className="h-5 w-5" />,
    features: ['S3 Compatible API', 'Large File Support', 'Global CDN', 'Server-side Encryption'],
    pros: [
      'Extremely cost-effective for large files',
      'No egress fees for first 1GB/day',
      'Excellent API compatibility',
      'High durability (99.999999999%)',
    ],
    cons: [
      'Newer provider',
      'Limited regions compared to AWS',
      'No built-in CDN (needs integration)',
    ],
    maxFileSize: '10TB',
    pricing: '$0.005/GB/month + $0.01/GB download',
    performance: 'excellent',
    security: 'excellent',
  },
  {
    provider: 'r2',
    name: 'Cloudflare R2',
    description: 'High-performance storage with global edge network and zero egress fees',
    icon: <Cloud className="h-5 w-5" />,
    features: ['Zero Egress Fees', 'Global Edge Network', 'Built-in CDN', 'DDoS Protection'],
    pros: [
      'Zero egress fees',
      'Excellent global performance',
      'Built-in DDoS protection',
      'Tight integration with Cloudflare services',
    ],
    cons: ['Newer service', 'Higher storage costs than B2', 'Limited advanced features'],
    maxFileSize: '5GB',
    pricing: '$0.015/GB/month + $0/GB download',
    performance: 'excellent',
    security: 'good',
  },
  {
    provider: 'firebase',
    name: 'Firebase Storage',
    description: 'Google-backed storage with excellent Firebase ecosystem integration',
    icon: <Server className="h-5 w-5" />,
    features: ['Firebase Integration', 'Real-time Updates', 'Security Rules', 'Image Resizing'],
    pros: [
      'Seamless Firebase integration',
      'Built-in security rules',
      'Real-time capabilities',
      'Generous free tier',
    ],
    cons: ['Higher costs at scale', 'Limited to 32MB on web', 'Vendor lock-in to Google ecosystem'],
    maxFileSize: '32MB (web)',
    pricing: '$0.026/GB/month + $0.12/GB download',
    performance: 'good',
    security: 'excellent',
  },
];

export function StorageProviderSelector({
  selectedProvider,
  onProviderChange,
  fileType,
  fileSize,
  showRecommendation = true,
  className,
}: StorageProviderSelectorProps) {
  const [recommended, setRecommended] = useState<StorageProvider | null>(null);

  // Calculate recommendation based on file characteristics
  useEffect(() => {
    if (showRecommendation && fileType && fileSize !== undefined) {
      const mockFile = new File([''], 'test', { type: fileType });
      Object.defineProperty(mockFile, 'size', { value: fileSize });
      const recommendedProvider = StorageConfig.getRecommendedProvider(mockFile);
      setRecommended(recommendedProvider);
    }
  }, [fileType, fileSize, showRecommendation]);

  const getPerformanceBadge = (performance: string) => {
    const colors = {
      excellent: 'bg-green-100 text-green-700',
      good: 'bg-blue-100 text-blue-700',
      fair: 'bg-yellow-100 text-yellow-700',
    };
    return colors[performance as keyof typeof colors] || colors.fair;
  };

  const getSecurityBadge = (security: string) => {
    const colors = {
      excellent: 'bg-green-100 text-green-700',
      good: 'bg-blue-100 text-blue-700',
      fair: 'bg-yellow-100 text-yellow-700',
    };
    return colors[security as keyof typeof colors] || colors.fair;
  };

  return (
    <div className={className}>
      {/* Recommendation Banner */}
      {showRecommendation && recommended && (
        <Card className="mb-6 p-4 bg-blue-50 border-blue-200">
          <div className="flex items-start space-x-3">
            <Info className="h-5 w-5 text-blue-600 mt-0.5" />
            <div>
              <h3 className="font-medium text-blue-900 mb-1">Recommended Provider</h3>
              <p className="text-sm text-blue-700">
                Based on your file type ({fileType}) and size (
                {StorageUtils.formatFileSize(fileSize || 0)}), we recommend{' '}
                <strong>{PROVIDER_INFO.find(p => p.provider === recommended)?.name}</strong>
                for optimal performance and cost-effectiveness.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Provider Selection */}
      <RadioGroup
        value={selectedProvider}
        onValueChange={value => onProviderChange(value as StorageProvider)}
        className="space-y-4"
      >
        {PROVIDER_INFO.map(provider => {
          const isRecommended = recommended === provider.provider;
          const isSelected = selectedProvider === provider.provider;

          return (
            <div key={provider.provider} className="relative">
              <Label htmlFor={provider.provider} className="cursor-pointer">
                <Card
                  className={`p-6 transition-all hover:shadow-md ${
                    isSelected ? 'ring-2 ring-primary border-primary' : 'hover:border-primary/50'
                  } ${isRecommended ? 'bg-blue-50/50 border-blue-200' : ''}`}
                >
                  {/* Recommended Badge */}
                  {isRecommended && (
                    <div className="absolute -top-2 -right-2">
                      <Badge className="bg-blue-600 text-white">Recommended</Badge>
                    </div>
                  )}

                  <div className="flex items-start space-x-4">
                    {/* Radio Button */}
                    <RadioGroupItem
                      value={provider.provider}
                      id={provider.provider}
                      className="mt-1"
                    />

                    {/* Icon */}
                    <div className="text-primary mt-1">{provider.icon}</div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      {/* Header */}
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-semibold text-lg">{provider.name}</h3>

                        <div className="flex items-center space-x-2">
                          <Badge className={getPerformanceBadge(provider.performance)}>
                            <Zap className="h-3 w-3 mr-1" />
                            {provider.performance}
                          </Badge>
                          <Badge className={getSecurityBadge(provider.security)}>
                            <Shield className="h-3 w-3 mr-1" />
                            {provider.security}
                          </Badge>
                        </div>
                      </div>

                      {/* Description */}
                      <p className="text-sm text-muted-foreground mb-4">{provider.description}</p>

                      {/* Key Stats */}
                      <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                        <div>
                          <span className="font-medium">Max File Size:</span>
                          <br />
                          <span className="text-muted-foreground">{provider.maxFileSize}</span>
                        </div>
                        <div>
                          <span className="font-medium">Pricing:</span>
                          <br />
                          <span className="text-muted-foreground">{provider.pricing}</span>
                        </div>
                      </div>

                      {/* Features */}
                      <div className="mb-4">
                        <h4 className="font-medium text-sm mb-2">Key Features:</h4>
                        <div className="flex flex-wrap gap-1">
                          {provider.features.map((feature, index) => (
                            <Badge key={index} variant="outline" className="text-xs">
                              {feature}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      {/* Expandable Details */}
                      {isSelected && (
                        <div className="space-y-4 pt-4 border-t">
                          {/* Pros */}
                          <div>
                            <h4 className="font-medium text-sm mb-2 text-green-700">Advantages:</h4>
                            <ul className="text-xs space-y-1">
                              {provider.pros.map((pro, index) => (
                                <li key={index} className="flex items-start space-x-2">
                                  <Check className="h-3 w-3 text-green-600 mt-0.5 flex-shrink-0" />
                                  <span className="text-muted-foreground">{pro}</span>
                                </li>
                              ))}
                            </ul>
                          </div>

                          {/* Cons */}
                          <div>
                            <h4 className="font-medium text-sm mb-2 text-orange-700">
                              Considerations:
                            </h4>
                            <ul className="text-xs space-y-1">
                              {provider.cons.map((con, index) => (
                                <li key={index} className="flex items-start space-x-2">
                                  <Info className="h-3 w-3 text-orange-600 mt-0.5 flex-shrink-0" />
                                  <span className="text-muted-foreground">{con}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              </Label>
            </div>
          );
        })}
      </RadioGroup>

      {/* Cost Comparison */}
      {fileSize && fileSize > 0 && (
        <Card className="mt-6 p-4">
          <h3 className="font-medium mb-3 flex items-center">
            <DollarSign className="h-4 w-4 mr-2" />
            Estimated Monthly Cost for {StorageUtils.formatFileSize(fileSize)}
          </h3>

          <div className="space-y-2 text-sm">
            {PROVIDER_INFO.map(provider => {
              const sizeGB = fileSize / (1024 * 1024 * 1024);
              let monthlyCost = 0;

              // Simple cost calculation (storage only)
              switch (provider.provider) {
                case 'b2':
                  monthlyCost = sizeGB * 0.005;
                  break;
                case 'r2':
                  monthlyCost = sizeGB * 0.015;
                  break;
                case 'firebase':
                  monthlyCost = sizeGB * 0.026;
                  break;
              }

              return (
                <div key={provider.provider} className="flex justify-between items-center">
                  <span>{provider.name}:</span>
                  <span className="font-medium">${monthlyCost.toFixed(4)}/month</span>
                </div>
              );
            })}
          </div>

          <p className="text-xs text-muted-foreground mt-2">
            * Estimates based on storage only. Download costs vary by provider.
          </p>
        </Card>
      )}
    </div>
  );
}

export default StorageProviderSelector;
