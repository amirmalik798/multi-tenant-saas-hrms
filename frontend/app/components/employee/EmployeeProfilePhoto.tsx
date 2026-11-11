
"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

type EmployeeProfilePhotoProps = {
  name: string;
  className: string;
  employeeId?: string | null;
  conversationId?: string;
  photoUrl?: string | null;
  refreshKey?: number;
  textClassName?: string;
};

function getInitials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "E"
  );
}

export default function EmployeeProfilePhoto({
  name,
  className,
  employeeId,
  conversationId,
  photoUrl,
  refreshKey = 0,
  textClassName = "text-xl font-black text-sky-100",
}: EmployeeProfilePhotoProps) {
  const [imageUnavailable, setImageUnavailable] = useState(false);
  const [useEmployeeFallback, setUseEmployeeFallback] = useState(false);

  const employeeImageUrl = employeeId === undefined
    ? `/api/backend/employees/me/photo?v=${refreshKey}`
    : employeeId
      ? `/api/backend/employees/${encodeURIComponent(employeeId)}/photo?v=${refreshKey}${conversationId ? `&conversationId=${encodeURIComponent(conversationId)}` : ""}`
      : null;
  const primaryImageUrl = photoUrl
    ? `${photoUrl}${photoUrl.includes("?") ? "&" : "?"}v=${refreshKey}`
    : employeeImageUrl;
  const imageUrl = photoUrl && useEmployeeFallback ? employeeImageUrl : primaryImageUrl;

  useEffect(() => {
    setImageUnavailable(!primaryImageUrl);
    setUseEmployeeFallback(false);
  }, [primaryImageUrl, employeeImageUrl]);

  function handleImageError() {
    if (photoUrl && employeeImageUrl && !useEmployeeFallback) {
      setUseEmployeeFallback(true);
      return;
    }
    setImageUnavailable(true);
  }

  return (
    <div
      className={`relative shrink-0 overflow-hidden ${className}`}
      aria-label={`${name}'s profile photo`}
    >
      {imageUrl && !imageUnavailable ? (
        <Image
          key={imageUrl}
          src={imageUrl}
          alt={`${name}'s profile`}
          fill
          unoptimized
          sizes="96px"
          className="object-cover"
          onError={handleImageError}
        />
      ) : (
        <span
          aria-hidden="true"
          className={`flex h-full w-full items-center justify-center ${textClassName}`}
        >
          {getInitials(name)}
        </span>
      )}
    </div>
  );
}
