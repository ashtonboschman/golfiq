/**
 * Mark all existing courses as verified
 * Run this once to verify all courses that existed before the verification system was added
 */

import { prisma } from '../lib/db';

async function verifyExistingCourses() {
  try {
    console.log('Finding unverified courses...');

    const unverifiedCount = await prisma.course.count({
      where: { verified: false }
    });

    console.log(`Found ${unverifiedCount} unverified courses`);

    if (unverifiedCount === 0) {
      console.log('All courses are already verified!');
      return;
    }

    console.log('Marking all courses as verified...');

    const result = await prisma.course.updateMany({
      where: { verified: false },
      data: { verified: true }
    });

    console.log(`✅ Successfully verified ${result.count} courses`);

    // Show sample of verified courses
    const verifiedCourses = await prisma.course.findMany({
      where: { verified: true },
      select: {
        id: true,
        courseName: true,
        clubName: true,
        createdDate: true
      },
      orderBy: { createdDate: 'desc' },
      take: 10
    });

    console.log('\nSample of verified courses:');
    verifiedCourses.forEach(course => {
      console.log(`  - ${course.courseName} (${course.clubName}) - ID: ${course.id}`);
    });

    // Show final counts
    const totalCourses = await prisma.course.count();
    const verifiedCount = await prisma.course.count({ where: { verified: true } });
    const unverifiedNow = await prisma.course.count({ where: { verified: false } });

    console.log(`\nFinal counts:`);
    console.log(`  Total courses: ${totalCourses}`);
    console.log(`  Verified: ${verifiedCount}`);
    console.log(`  Unverified: ${unverifiedNow}`);

  } catch (error) {
    console.error('Error verifying courses:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

verifyExistingCourses()
  .then(() => {
    console.log('\n✅ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Failed:', error);
    process.exit(1);
  });
