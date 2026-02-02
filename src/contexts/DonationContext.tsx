import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
  Timestamp,
  deleteDoc
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

export type DonationStatus = 'available' | 'requested' | 'collected' | 'cancelled';

export interface DonationItem {
  id: string;
  name: string;
  isVeg: boolean;
  quantity: number;
  unit: string;
}

export interface Donation {
  id: string;
  itemName: string;
  isVeg: boolean;
  quantity: number;
  quantityUnit: string;
  items: DonationItem[];
  weight: number;
  location: string;
  expiryTime: Date;
  notes: string;
  contactName?: string;
  contactPhone?: string;
  donorId: string;
  donorName: string;
  status: DonationStatus;
  requestedBy: string | null;
  requestedByName: string | null;
  requestedAt?: Date; // NEW: Track when it was requested
  createdAt: Date;
}

interface DonationContextType {
  donations: Donation[];
  addDonation: (donation: Omit<Donation, 'id' | 'status' | 'requestedBy' | 'requestedByName' | 'createdAt'>) => Promise<void>;
  requestDonation: (donationId: string, ngoId: string, ngoName: string) => Promise<void>;
  cancelRequest: (donationId: string) => Promise<void>; // NEW: NGO can cancel within 15 mins
  markAsCollected: (donationId: string) => Promise<void>;
  cancelDonation: (donationId: string) => Promise<void>;
  deleteDonation: (donationId: string) => Promise<void>;
  getDonationsByDonor: (donorId: string) => Donation[];
  getAvailableAndRequestedDonations: () => Donation[];
  getRequestedByNgo: (ngoId: string) => Donation[];
}

const DonationContext = createContext<DonationContextType | undefined>(undefined);

export const DonationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [donations, setDonations] = useState<Donation[]>([]);

  // Setup real-time listener for all donations
  useEffect(() => {
    const q = query(collection(db, 'donations'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const donationData: Donation[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        donationData.push({
          ...(data as Record<string, unknown>),
          id: doc.id,
          expiryTime: data.expiryTime instanceof Timestamp ? data.expiryTime.toDate() : new Date(data.expiryTime),
          createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(data.createdAt),
          requestedAt: data.requestedAt instanceof Timestamp ? data.requestedAt.toDate() : (data.requestedAt ? new Date(data.requestedAt) : undefined),
        } as Donation);
      });
      setDonations(donationData);
    });

    return () => unsubscribe();
  }, []);

  const addDonation = useCallback(async (newDonation: Omit<Donation, 'id' | 'status' | 'requestedBy' | 'requestedByName' | 'createdAt'>) => {
    try {
      await addDoc(collection(db, 'donations'), {
        ...newDonation,
        status: 'available',
        requestedBy: null,
        requestedByName: null,
        createdAt: Timestamp.now(),
        // Convert Date to Timestamp if it isn't already
        expiryTime: newDonation.expiryTime instanceof Date ? Timestamp.fromDate(newDonation.expiryTime) : newDonation.expiryTime,
      });
    } catch (error) {
      console.error("Error adding donation: ", error);
      throw error;
    }
  }, []);

  const requestDonation = useCallback(async (donationId: string, ngoId: string, ngoName: string) => {
    try {
      const donationRef = doc(db, 'donations', donationId);
      await updateDoc(donationRef, {
        status: 'requested',
        requestedBy: ngoId,
        requestedByName: ngoName,
        requestedAt: Timestamp.now()
      });
    } catch (error) {
      console.error("Error requesting donation: ", error);
      throw error;
    }
  }, []);

  const cancelRequest = useCallback(async (donationId: string) => {
    try {
      const donationRef = doc(db, 'donations', donationId);
      await updateDoc(donationRef, {
        status: 'available',
        requestedBy: null,
        requestedByName: null,
        requestedAt: null // Clear the requested time
      });
    } catch (error) {
      console.error("Error cancelling request: ", error);
      throw error;
    }
  }, []);

  const markAsCollected = useCallback(async (donationId: string) => {
    try {
      const donationRef = doc(db, 'donations', donationId);
      await updateDoc(donationRef, {
        status: 'collected'
      });
    } catch (error) {
      console.error("Error marking as collected: ", error);
      throw error;
    }
  }, []);

  const cancelDonation = useCallback(async (donationId: string) => {
    try {
      const donationRef = doc(db, 'donations', donationId);
      await updateDoc(donationRef, {
        status: 'cancelled'
      });
    } catch (error) {
      console.error("Error cancelling donation: ", error);
      throw error;
    }
  }, []);

  const deleteDonation = useCallback(async (donationId: string) => {
    try {
      const donationRef = doc(db, 'donations', donationId);
      await deleteDoc(donationRef);
    } catch (error) {
      console.error("Error deleting donation: ", error);
      throw error;
    }
  }, []);

  const getDonationsByDonor = useCallback((donorId: string) => {
    return donations.filter(d => d.donorId === donorId);
  }, [donations]);

  const getAvailableAndRequestedDonations = useCallback(() => {
    return donations.filter(d => d.status === 'available' || d.status === 'requested');
  }, [donations]);

  const getRequestedByNgo = useCallback((ngoId: string) => {
    return donations.filter(d => d.requestedBy === ngoId);
  }, [donations]);

  return (
    <DonationContext.Provider
      value={{
        donations,
        addDonation,
        requestDonation,
        cancelRequest,
        markAsCollected,
        cancelDonation,
        deleteDonation,
        getDonationsByDonor,
        getAvailableAndRequestedDonations,
        getRequestedByNgo,
      }}
    >
      {children}
    </DonationContext.Provider>
  );
};

export const useDonations = () => {
  const context = useContext(DonationContext);
  if (context === undefined) {
    throw new Error('useDonations must be used within a DonationProvider');
  }
  return context;
};
